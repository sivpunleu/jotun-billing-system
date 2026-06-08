import mongoose from 'mongoose'
import { writeAuditLog } from '../repositories/auditRepository.js'
import {
  createCatalogRecord,
  deleteCatalogRecord,
  listCatalogRecords,
  restoreCatalogRecord,
  updateCatalogRecord,
} from '../repositories/catalogRepository.js'

const sendError = (res, error) => {
  if (error.code === 11000) {
    return res.status(409).json({ message: 'This value already exists' })
  }
  if (error instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({
      message: Object.values(error.errors)
        .map((item) => item.message)
        .join(', '),
    })
  }
  if (error.name === 'CastError') {
    return res.status(400).json({ message: 'Invalid record ID' })
  }
  return res.status(400).json({ message: error.message || 'Request failed' })
}

const cleanCustomer = (body, actor) => {
  const name = String(body.name || '').trim()
  if (!name) throw new Error('Customer name is required')
  return {
    name,
    phone: String(body.phone || '').trim(),
    address: String(body.address || '').trim(),
    notes: String(body.notes || '').trim(),
    updatedBy: actor,
  }
}

const cleanProduct = (body, actor) => {
  const name = String(body.name || '').trim()
  const unit = String(body.unit || '').trim()
  const unitPrice = Number(body.unitPrice)
  if (!name) throw new Error('Product name is required')
  if (!unit) throw new Error('Product unit is required')
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    throw new Error('Unit price must be zero or greater')
  }
  return {
    name,
    itemCode: String(body.itemCode || '').trim().toUpperCase(),
    colorCode: String(body.colorCode || '').trim(),
    unit,
    unitPrice: Math.round(unitPrice * 100) / 100,
    notes: String(body.notes || '').trim(),
    updatedBy: actor,
  }
}

const normalize = (type, body, actor) =>
  type === 'customers'
    ? cleanCustomer(body, actor)
    : cleanProduct(body, actor)

const buildController = (type, entityType) => ({
  list: async (req, res) => {
    try {
      const result = await listCatalogRecords(type, {
        search: req.query.search,
        page: req.query.page,
        limit: req.query.limit,
        deleted: req.query.deleted === 'true',
      })
      res.json({
        items: result.items,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          pages: Math.max(1, Math.ceil(result.total / result.limit)),
        },
      })
    } catch (error) {
      sendError(res, error)
    }
  },
  create: async (req, res) => {
    try {
      const payload = normalize(type, req.body, req.admin.username)
      payload.createdBy = req.admin.username
      const record = await createCatalogRecord(type, payload)
      await writeAuditLog({
        actor: req.admin,
        action: 'create',
        entityType,
        entityId: record._id,
        summary: record.name,
      })
      res.status(201).json(record)
    } catch (error) {
      sendError(res, error)
    }
  },
  update: async (req, res) => {
    try {
      const record = await updateCatalogRecord(
        type,
        req.params.id,
        normalize(type, req.body, req.admin.username),
      )
      if (!record) return res.status(404).json({ message: 'Record not found' })
      await writeAuditLog({
        actor: req.admin,
        action: 'update',
        entityType,
        entityId: record._id,
        summary: record.name,
      })
      res.json(record)
    } catch (error) {
      sendError(res, error)
    }
  },
  remove: async (req, res) => {
    try {
      const record = await deleteCatalogRecord(
        type,
        req.params.id,
        req.admin.username,
      )
      if (!record) return res.status(404).json({ message: 'Record not found' })
      await writeAuditLog({
        actor: req.admin,
        action: 'delete',
        entityType,
        entityId: record._id,
        summary: record.name,
      })
      res.json(record)
    } catch (error) {
      sendError(res, error)
    }
  },
  restore: async (req, res) => {
    try {
      const record = await restoreCatalogRecord(
        type,
        req.params.id,
        req.admin.username,
      )
      if (!record) {
        return res.status(404).json({ message: 'Deleted record not found' })
      }
      await writeAuditLog({
        actor: req.admin,
        action: 'restore',
        entityType,
        entityId: record._id,
        summary: record.name,
      })
      res.json(record)
    } catch (error) {
      sendError(res, error)
    }
  },
})

export const customerController = buildController('customers', 'customer')
export const productController = buildController('products', 'product')
