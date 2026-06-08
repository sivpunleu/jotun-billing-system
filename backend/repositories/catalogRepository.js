import { randomUUID } from 'node:crypto'
import { getStorageMode } from '../config/db.js'
import Customer from '../models/Customer.js'
import Product from '../models/Product.js'
import {
  mutateLocalCollection,
  readLocalCollection,
} from './localStore.js'

const catalogConfig = {
  customers: {
    Model: Customer,
    duplicateField: null,
  },
  products: {
    Model: Product,
    duplicateField: 'itemCode',
  },
}

const getConfig = (type) => {
  const config = catalogConfig[type]
  if (!config) throw new Error('Unknown catalogue type')
  return config
}

const matchesSearch = (record, search, fields) => {
  const query = String(search || '').toLocaleLowerCase()
  if (!query) return true
  return fields.some((field) =>
    String(record[field] || '').toLocaleLowerCase().includes(query),
  )
}

export const listCatalogRecords = async (
  type,
  { search = '', page = 1, limit = 20, deleted = false } = {},
) => {
  const { Model } = getConfig(type)
  const normalizedPage = Math.max(1, Number(page) || 1)
  const normalizedLimit = Math.min(100, Math.max(1, Number(limit) || 20))

  if (getStorageMode() === 'mongodb') {
    const safeSearch = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const searchFields =
      type === 'customers'
        ? ['name', 'phone', 'address']
        : ['name', 'itemCode', 'colorCode']
    const filter = {
      deletedAt: deleted ? { $ne: null } : null,
    }
    if (safeSearch) {
      filter.$or = searchFields.map((field) => ({
        [field]: { $regex: safeSearch, $options: 'i' },
      }))
    }

    const [items, total] = await Promise.all([
      Model.find(filter)
        .sort({ createdAt: -1 })
        .skip((normalizedPage - 1) * normalizedLimit)
        .limit(normalizedLimit),
      Model.countDocuments(filter),
    ])
    return { items, total, page: normalizedPage, limit: normalizedLimit }
  }

  const fields =
    type === 'customers'
      ? ['name', 'phone', 'address']
      : ['name', 'itemCode', 'colorCode']
  const records = (await readLocalCollection(type))
    .filter((record) =>
      deleted ? Boolean(record.deletedAt) : !record.deletedAt,
    )
    .filter((record) => matchesSearch(record, search, fields))
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
  const offset = (normalizedPage - 1) * normalizedLimit
  return {
    items: records.slice(offset, offset + normalizedLimit),
    total: records.length,
    page: normalizedPage,
    limit: normalizedLimit,
  }
}

export const findCatalogRecord = async (type, id) => {
  const { Model } = getConfig(type)
  if (getStorageMode() === 'mongodb') {
    return Model.findOne({ _id: id, deletedAt: null })
  }
  const records = await readLocalCollection(type)
  return (
    records.find(
      (record) => String(record._id) === String(id) && !record.deletedAt,
    ) || null
  )
}

export const createCatalogRecord = async (type, payload) => {
  const { Model, duplicateField } = getConfig(type)
  if (getStorageMode() === 'mongodb') {
    return Model.create(payload)
  }

  return mutateLocalCollection(type, (records) => {
    if (
      duplicateField &&
      payload[duplicateField] &&
      records.some(
        (record) =>
          !record.deletedAt &&
          String(record[duplicateField] || '').toUpperCase() ===
            String(payload[duplicateField]).toUpperCase(),
      )
    ) {
      const error = new Error(`${duplicateField} already exists`)
      error.code = 11000
      throw error
    }
    const timestamp = new Date().toISOString()
    const record = {
      ...payload,
      _id: randomUUID(),
      deletedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    records.push(record)
    return record
  })
}

export const updateCatalogRecord = async (type, id, payload) => {
  const { Model, duplicateField } = getConfig(type)
  if (getStorageMode() === 'mongodb') {
    return Model.findOneAndUpdate({ _id: id, deletedAt: null }, payload, {
      new: true,
      runValidators: true,
    })
  }

  return mutateLocalCollection(type, (records) => {
    const index = records.findIndex(
      (record) => String(record._id) === String(id) && !record.deletedAt,
    )
    if (index === -1) return null
    if (
      duplicateField &&
      payload[duplicateField] &&
      records.some(
        (record, recordIndex) =>
          recordIndex !== index &&
          !record.deletedAt &&
          String(record[duplicateField] || '').toUpperCase() ===
            String(payload[duplicateField]).toUpperCase(),
      )
    ) {
      const error = new Error(`${duplicateField} already exists`)
      error.code = 11000
      throw error
    }
    records[index] = {
      ...records[index],
      ...payload,
      updatedAt: new Date().toISOString(),
    }
    return records[index]
  })
}

export const deleteCatalogRecord = async (type, id, actor) => {
  const { Model } = getConfig(type)
  const deletedAt = new Date()
  if (getStorageMode() === 'mongodb') {
    return Model.findOneAndUpdate(
      { _id: id, deletedAt: null },
      { deletedAt, updatedBy: actor },
      { new: true },
    )
  }
  return mutateLocalCollection(type, (records) => {
    const record = records.find(
      (item) => String(item._id) === String(id) && !item.deletedAt,
    )
    if (!record) return null
    record.deletedAt = deletedAt.toISOString()
    record.updatedBy = actor
    record.updatedAt = deletedAt.toISOString()
    return record
  })
}

export const restoreCatalogRecord = async (type, id, actor) => {
  const { Model } = getConfig(type)
  if (getStorageMode() === 'mongodb') {
    return Model.findOneAndUpdate(
      { _id: id, deletedAt: { $ne: null } },
      { deletedAt: null, updatedBy: actor },
      { new: true },
    )
  }
  return mutateLocalCollection(type, (records) => {
    const record = records.find(
      (item) => String(item._id) === String(id) && item.deletedAt,
    )
    if (!record) return null
    record.deletedAt = null
    record.updatedBy = actor
    record.updatedAt = new Date().toISOString()
    return record
  })
}

export const getAllCatalogRecords = async (type) => {
  const { Model } = getConfig(type)
  if (getStorageMode() === 'mongodb') {
    return Model.find({}).lean()
  }
  return readLocalCollection(type)
}
