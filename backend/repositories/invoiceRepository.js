import { randomUUID } from 'node:crypto'
import { getStorageMode } from '../config/db.js'
import Counter from '../models/Counter.js'
import Invoice from '../models/Invoice.js'
import { createShareToken } from '../utils/shareToken.js'
import {
  mutateLocalCollection,
  readLocalCollection,
} from './localStore.js'

const duplicateInvoiceError = () => {
  const error = new Error('Invoice number already exists')
  error.code = 11000
  return error
}

const normalizePagination = (page, limit) => ({
  page: Math.max(1, Number(page) || 1),
  limit: Math.min(100, Math.max(1, Number(limit) || 10)),
})

const matchesInvoiceSearch = (invoice, search) => {
  const query = String(search || '').toLocaleLowerCase()
  if (!query) return true
  return [
    invoice.invoiceNumber,
    invoice.customer?.name,
    invoice.customer?.phone,
    invoice.salesperson?.name,
  ].some((value) => String(value || '').toLocaleLowerCase().includes(query))
}

const resolvedStatus = (invoice) => {
  if (invoice.status) return invoice.status
  if (invoice.paymentStatus === 'partial') return 'partially_paid'
  return invoice.paymentStatus || 'unpaid'
}

const existingShareTokens = (invoices) =>
  new Set(invoices.map((invoice) => invoice.shareToken).filter(Boolean))

export const createUniqueShareToken = (usedTokens = new Set()) => {
  let token = createShareToken()
  while (usedTokens.has(token)) token = createShareToken()
  usedTokens.add(token)
  return token
}

export const listInvoices = async ({
  search = '',
  page = 1,
  limit = 10,
  status = '',
  salesChannel = '',
  salespersonId = '',
  deleted = false,
} = {}) => {
  const pagination = normalizePagination(page, limit)

  if (getStorageMode() === 'mongodb') {
    const safeQuery = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const filter = {
      deletedAt: deleted ? { $ne: null } : null,
    }
    if (safeQuery) {
      filter.$or = [
        { invoiceNumber: { $regex: safeQuery, $options: 'i' } },
        { 'customer.name': { $regex: safeQuery, $options: 'i' } },
        { 'customer.phone': { $regex: safeQuery, $options: 'i' } },
        { 'salesperson.name': { $regex: safeQuery, $options: 'i' } },
      ]
    }
    if (status) {
      if (['unpaid', 'partially_paid', 'paid'].includes(status)) {
        const legacyStatus =
          status === 'partially_paid' ? 'partial' : status
        filter.$and = [
          {
            $or: [
              { status },
              {
                status: { $exists: false },
                paymentStatus: legacyStatus,
              },
            ],
          },
        ]
      } else {
        filter.status = status
      }
    }
    if (salesChannel === 'store') {
      filter.$and = [
        ...(filter.$and || []),
        {
          $or: [
            { salesChannel: 'store' },
            { salesChannel: { $exists: false } },
          ],
        },
      ]
    } else if (salesChannel === 'salesperson') {
      filter.salesChannel = 'salesperson'
    }
    if (salespersonId) {
      filter.salespersonId = salespersonId
    }

    const [items, total] = await Promise.all([
      Invoice.find(filter)
        .sort({ createdAt: -1 })
        .skip((pagination.page - 1) * pagination.limit)
        .limit(pagination.limit),
      Invoice.countDocuments(filter),
    ])
    return { items, total, ...pagination }
  }

  const invoices = (await readLocalCollection('invoices'))
    .filter((invoice) =>
      deleted ? Boolean(invoice.deletedAt) : !invoice.deletedAt,
    )
    .filter((invoice) => matchesInvoiceSearch(invoice, search))
    .filter((invoice) => !status || resolvedStatus(invoice) === status)
    .filter(
      (invoice) =>
        !salesChannel ||
        (invoice.salesChannel || 'store') === salesChannel,
    )
    .filter(
      (invoice) =>
        !salespersonId ||
        String(invoice.salespersonId || '') === String(salespersonId),
    )
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
  const offset = (pagination.page - 1) * pagination.limit
  return {
    items: invoices.slice(offset, offset + pagination.limit),
    total: invoices.length,
    ...pagination,
  }
}

export const findInvoiceById = async (id, { includeDeleted = false } = {}) => {
  if (getStorageMode() === 'mongodb') {
    return Invoice.findOne({
      _id: id,
      ...(includeDeleted ? {} : { deletedAt: null }),
    })
  }

  const invoices = await readLocalCollection('invoices')
  return (
    invoices.find(
      (invoice) =>
        String(invoice._id) === String(id) &&
        (includeDeleted || !invoice.deletedAt),
    ) || null
  )
}

export const findInvoiceByShareToken = async (shareToken) => {
  const token = String(shareToken || '').trim()
  if (!token) return null

  if (getStorageMode() === 'mongodb') {
    return Invoice.findOne({ shareToken: token, deletedAt: null })
  }

  const invoices = await readLocalCollection('invoices')
  return (
    invoices.find(
      (invoice) =>
        String(invoice.shareToken || '') === token && !invoice.deletedAt,
    ) || null
  )
}

export const reserveInvoiceNumber = async (dateValue = new Date()) => {
  const year = new Date(dateValue).getFullYear()
  if (getStorageMode() === 'mongodb') {
    const counterId = `invoice-${year}`
    const existingCounter = await Counter.findById(counterId)
    if (!existingCounter) {
      const latestInvoice = await Invoice.findOne({
        invoiceNumber: {
          $regex: new RegExp(`^INV-${year}-\\d{5}$`),
        },
      })
        .sort({ invoiceNumber: -1 })
        .select('invoiceNumber')
        .lean()
      const latestSequence = Number(
        String(latestInvoice?.invoiceNumber || '').split('-').pop(),
      )
      try {
        await Counter.create({
          _id: counterId,
          sequence: Number.isFinite(latestSequence) ? latestSequence : 0,
        })
      } catch (error) {
        if (error.code !== 11000) throw error
      }
    }
    const counter = await Counter.findByIdAndUpdate(
      counterId,
      { $inc: { sequence: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    )
    return `INV-${year}-${String(counter.sequence).padStart(5, '0')}`
  }

  const invoices = await readLocalCollection('invoices')
  const latestSequence = invoices.reduce((highest, invoice) => {
    const match = String(invoice.invoiceNumber || '').match(
      new RegExp(`^INV-${year}-(\\d{5})$`),
    )
    return match ? Math.max(highest, Number(match[1])) : highest
  }, 0)

  return mutateLocalCollection('counters', (counters) => {
    const id = `invoice-${year}`
    let counter = counters.find((item) => item._id === id)
    if (!counter) {
      counter = { _id: id, sequence: latestSequence }
      counters.push(counter)
    }
    counter.sequence += 1
    return `INV-${year}-${String(counter.sequence).padStart(5, '0')}`
  })
}

export const insertInvoice = async (payload) => {
  if (getStorageMode() === 'mongodb') {
    return Invoice.create({
      ...payload,
      shareToken: payload.shareToken || createShareToken(),
    })
  }

  return mutateLocalCollection('invoices', (invoices) => {
    const duplicate = invoices.some(
      (invoice) =>
        String(invoice.invoiceNumber).toUpperCase() ===
        String(payload.invoiceNumber).toUpperCase(),
    )
    if (duplicate) throw duplicateInvoiceError()

    const timestamp = new Date().toISOString()
    const usedTokens = existingShareTokens(invoices)
    const invoice = {
      ...payload,
      invoiceNumber: String(payload.invoiceNumber).toUpperCase(),
      shareToken: payload.shareToken || createUniqueShareToken(usedTokens),
      _id: randomUUID(),
      deletedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    invoices.push(invoice)
    return invoice
  })
}

export const replaceInvoice = async (id, payload) => {
  if (getStorageMode() === 'mongodb') {
    return Invoice.findOneAndUpdate(
      { _id: id, deletedAt: null },
      payload,
      {
        new: true,
        runValidators: true,
      },
    )
  }

  return mutateLocalCollection('invoices', (invoices) => {
    const index = invoices.findIndex(
      (invoice) =>
        String(invoice._id) === String(id) && !invoice.deletedAt,
    )
    if (index === -1) return null

    const duplicate = invoices.some(
      (invoice, invoiceIndex) =>
        invoiceIndex !== index &&
        String(invoice.invoiceNumber).toUpperCase() ===
          String(payload.invoiceNumber).toUpperCase(),
    )
    if (duplicate) throw duplicateInvoiceError()

    const invoice = {
      ...invoices[index],
      ...payload,
      invoiceNumber: String(payload.invoiceNumber).toUpperCase(),
      _id: invoices[index]._id,
      createdAt: invoices[index].createdAt,
      updatedAt: new Date().toISOString(),
    }
    invoices[index] = invoice
    return invoice
  })
}

export const softDeleteInvoice = async (id, actor) => {
  const timestamp = new Date()
  if (getStorageMode() === 'mongodb') {
    return Invoice.findOneAndUpdate(
      { _id: id, deletedAt: null },
      { deletedAt: timestamp, deletedBy: actor },
      { new: true },
    )
  }
  return mutateLocalCollection('invoices', (invoices) => {
    const invoice = invoices.find(
      (item) => String(item._id) === String(id) && !item.deletedAt,
    )
    if (!invoice) return null
    invoice.deletedAt = timestamp.toISOString()
    invoice.deletedBy = actor
    invoice.updatedAt = timestamp.toISOString()
    return invoice
  })
}

export const restoreInvoice = async (id, actor) => {
  if (getStorageMode() === 'mongodb') {
    return Invoice.findOneAndUpdate(
      { _id: id, deletedAt: { $ne: null } },
      { deletedAt: null, deletedBy: '', updatedBy: actor },
      { new: true },
    )
  }
  return mutateLocalCollection('invoices', (invoices) => {
    const invoice = invoices.find(
      (item) => String(item._id) === String(id) && item.deletedAt,
    )
    if (!invoice) return null
    invoice.deletedAt = null
    invoice.deletedBy = ''
    invoice.updatedBy = actor
    invoice.updatedAt = new Date().toISOString()
    return invoice
  })
}

export const appendInvoicePayment = async (id, payment, totals) => {
  if (getStorageMode() === 'mongodb') {
    return Invoice.findOneAndUpdate(
      { _id: id, deletedAt: null },
      {
        $push: { payments: payment },
        $set: totals,
      },
      { new: true, runValidators: true },
    )
  }
  return mutateLocalCollection('invoices', (invoices) => {
    const invoice = invoices.find(
      (item) => String(item._id) === String(id) && !item.deletedAt,
    )
    if (!invoice) return null
    const timestamp = new Date().toISOString()
    invoice.payments = Array.isArray(invoice.payments) ? invoice.payments : []
    invoice.payments.push({
      ...payment,
      _id: randomUUID(),
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    Object.assign(invoice, totals, { updatedAt: timestamp })
    return invoice
  })
}

export const getAllInvoices = async () => {
  if (getStorageMode() === 'mongodb') {
    return Invoice.find({}).sort({ createdAt: -1 }).lean()
  }
  return readLocalCollection('invoices')
}

export const backfillLocalShareTokens = async () => {
  if (getStorageMode() === 'mongodb') return 0
  return mutateLocalCollection('invoices', (invoices) => {
    const usedTokens = existingShareTokens(invoices)
    let updated = 0
    invoices.forEach((invoice) => {
      if (invoice.shareToken) return
      invoice.shareToken = createUniqueShareToken(usedTokens)
      invoice.updatedAt = new Date().toISOString()
      updated += 1
    })
    return updated
  })
}

export const getInvoiceDashboard = async () => {
  const invoices = (await getAllInvoices()).filter(
    (invoice) => !invoice.deletedAt,
  )
  const paidInvoices = invoices.filter(
    (invoice) => resolvedStatus(invoice) === 'paid',
  )
  const activeInvoices = invoices.filter(
    (invoice) =>
      !['draft', 'cancelled'].includes(resolvedStatus(invoice)),
  )
  const revenue = activeInvoices.reduce(
    (sum, invoice) =>
      sum +
      Math.max(
        Number(invoice.paidAmount || 0),
        Math.max(
          0,
          Number(invoice.grandTotal || 0) - Number(invoice.balanceDue || 0),
        ),
      ),
    0,
  )
  const outstanding = activeInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.balanceDue || 0),
    0,
  )
  const totalsByStatus = [
    'draft',
    'unpaid',
    'partially_paid',
    'paid',
    'cancelled',
  ].reduce((result, status) => {
    result[status] = invoices.filter(
      (invoice) => resolvedStatus(invoice) === status,
    ).length
    return result
  }, {})

  return {
    totalInvoices: invoices.length,
    revenue: Math.round(revenue * 100) / 100,
    outstanding: Math.round(outstanding * 100) / 100,
    paidInvoices: paidInvoices.length,
    totalsByStatus,
    recentInvoices: invoices
      .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
      .slice(0, 5),
  }
}
