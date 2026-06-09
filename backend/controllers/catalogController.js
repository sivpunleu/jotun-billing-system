import mongoose from 'mongoose'
import { writeAuditLog } from '../repositories/auditRepository.js'
import {
  createCatalogRecord,
  deleteCatalogRecord,
  listCatalogRecords,
  restoreCatalogRecord,
  recordProductStockMovement,
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
  const stockQuantity = Number(body.stockQuantity ?? 0)
  const lowStockThreshold = Number(body.lowStockThreshold ?? 5)
  if (!name) throw new Error('Product name is required')
  if (!unit) throw new Error('Product unit is required')
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    throw new Error('Unit price must be zero or greater')
  }
  if (!Number.isFinite(stockQuantity) || stockQuantity < 0) {
    throw new Error('Stock quantity must be zero or greater')
  }
  if (!Number.isFinite(lowStockThreshold) || lowStockThreshold < 0) {
    throw new Error('Low stock threshold must be zero or greater')
  }
  return {
    name,
    itemCode: String(body.itemCode || '').trim().toUpperCase(),
    colorCode: String(body.colorCode || '').trim(),
    unit,
    unitPrice: Math.round(unitPrice * 100) / 100,
    stockQuantity: Math.round(stockQuantity * 100) / 100,
    lowStockThreshold: Math.round(lowStockThreshold * 100) / 100,
    notes: String(body.notes || '').trim(),
    updatedBy: actor,
  }
}

const cleanSalesperson = (body, actor) => {
  const name = String(body.name || '').trim()
  if (!name) throw new Error('Salesperson name is required')
  return {
    name,
    phone: String(body.phone || '').trim(),
    notes: String(body.notes || '').trim(),
    updatedBy: actor,
  }
}

const normalize = (type, body, actor) => {
  if (type === 'customers') return cleanCustomer(body, actor)
  if (type === 'products') return cleanProduct(body, actor)
  return cleanSalesperson(body, actor)
}

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
export const salespersonController = buildController(
  'salespeople',
  'salesperson',
)

export const updateProductStock = async (req, res) => {
  try {
    const type = String(req.body.type || '').trim()
    const quantity = Number(req.body.quantity)
    if (!['in', 'out', 'set'].includes(type)) {
      throw new Error('Stock movement type must be in, out, or set')
    }
    if (!Number.isFinite(quantity) || quantity < 0) {
      throw new Error('Stock quantity must be zero or greater')
    }
    if (type !== 'set' && quantity <= 0) {
      throw new Error('Stock movement quantity must be greater than zero')
    }

    const product = await recordProductStockMovement(req.params.id, {
      type,
      quantity: Math.round(quantity * 100) / 100,
      note: String(req.body.note || '').trim(),
      actor: req.admin.username,
    })
    if (!product) {
      return res.status(404).json({ message: 'Product not found' })
    }

    await writeAuditLog({
      actor: req.admin,
      action: `stock_${type}`,
      entityType: 'product',
      entityId: product._id,
      summary: `${product.name}: ${quantity}`,
      details: {
        quantity,
        stockQuantity: product.stockQuantity,
      },
    })
    res.json(product)
  } catch (error) {
    sendError(res, error)
  }
}
