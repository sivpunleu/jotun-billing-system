import mongoose from 'mongoose'
import { writeAuditLog } from '../repositories/auditRepository.js'
import { findCatalogRecord } from '../repositories/catalogRepository.js'
import {
  cancelDraftPurchase,
  findPurchaseById,
  insertPurchase,
  listPurchases,
  receiveDraftPurchase,
  replaceDraftPurchase,
  reservePurchaseNumber,
} from '../repositories/purchaseRepository.js'

const roundMoney = (value) => Math.round(Number(value || 0) * 100) / 100

const sendError = (res, error) => {
  if (error.code === 11000) {
    return res.status(409).json({ message: 'Purchase number already exists' })
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

const normalizePurchase = async (
  body,
  { purchaseNumber, actor } = {},
) => {
  const purchaseDate = new Date(body.purchaseDate)
  if (!purchaseNumber) throw new Error('Purchase number is required')
  if (Number.isNaN(purchaseDate.getTime())) {
    throw new Error('Purchase date is invalid')
  }

  const supplier = await findCatalogRecord('suppliers', body.supplierId)
  if (!supplier) throw new Error('Please select an active supplier')

  const sourceItems = Array.isArray(body.items) ? body.items : []
  if (!sourceItems.length) {
    throw new Error('At least one purchase item is required')
  }
  const productIds = sourceItems.map((item) => String(item.productId || ''))
  if (productIds.some((id) => !id)) {
    throw new Error('Every purchase item needs a product')
  }
  if (new Set(productIds).size !== productIds.length) {
    throw new Error('A product can only appear once in a purchase')
  }

  const items = []
  for (const source of sourceItems) {
    const product = await findCatalogRecord('products', source.productId)
    if (!product) throw new Error('One or more products are unavailable')
    const quantity = Number(source.quantity)
    const unitCost = Number(source.unitCost)
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('Purchase quantity must be greater than zero')
    }
    if (!Number.isFinite(unitCost) || unitCost < 0) {
      throw new Error('Unit cost must be zero or greater')
    }
    items.push({
      productId: product._id,
      name: product.name,
      colorCode: product.colorCode || '',
      unit: product.unit || '',
      quantity: roundMoney(quantity),
      unitCost: roundMoney(unitCost),
      total: roundMoney(quantity * unitCost),
    })
  }

  return {
    purchaseNumber,
    purchaseDate: purchaseDate.toISOString(),
    supplierId: supplier._id,
    supplier: {
      name: supplier.name,
      phone: supplier.phone || '',
    },
    items,
    subtotal: roundMoney(
      items.reduce((sum, item) => sum + Number(item.total || 0), 0),
    ),
    notes: String(body.notes || '').trim(),
    updatedBy: actor,
  }
}

export const getPurchases = async (req, res) => {
  try {
    const result = await listPurchases({
      search: req.query.search,
      status: req.query.status,
      page: req.query.page,
      limit: req.query.limit,
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
}

export const getPurchaseById = async (req, res) => {
  try {
    const purchase = await findPurchaseById(req.params.id)
    if (!purchase) {
      return res.status(404).json({ message: 'Purchase not found' })
    }
    res.json(purchase)
  } catch (error) {
    sendError(res, error)
  }
}

export const createPurchase = async (req, res) => {
  try {
    const purchaseNumber = await reservePurchaseNumber(req.body.purchaseDate)
    const payload = await normalizePurchase(req.body, {
      purchaseNumber,
      actor: req.admin.username,
    })
    payload.createdBy = req.admin.username
    const purchase = await insertPurchase(payload)
    await writeAuditLog({
      actor: req.admin,
      action: 'create',
      entityType: 'purchase',
      entityId: purchase._id,
      summary: purchase.purchaseNumber,
      details: { supplier: purchase.supplier.name, subtotal: purchase.subtotal },
    })
    res.status(201).json(purchase)
  } catch (error) {
    sendError(res, error)
  }
}

export const updatePurchase = async (req, res) => {
  try {
    const existing = await findPurchaseById(req.params.id)
    if (!existing) {
      return res.status(404).json({ message: 'Purchase not found' })
    }
    if (existing.status !== 'draft') {
      return res.status(409).json({ message: 'Only draft purchases can be edited' })
    }
    const payload = await normalizePurchase(req.body, {
      purchaseNumber: existing.purchaseNumber,
      actor: req.admin.username,
    })
    const purchase = await replaceDraftPurchase(req.params.id, payload)
    await writeAuditLog({
      actor: req.admin,
      action: 'update',
      entityType: 'purchase',
      entityId: purchase._id,
      summary: purchase.purchaseNumber,
    })
    res.json(purchase)
  } catch (error) {
    sendError(res, error)
  }
}

export const receivePurchase = async (req, res) => {
  try {
    const purchase = await receiveDraftPurchase(
      req.params.id,
      req.admin.username,
    )
    if (!purchase) {
      return res.status(409).json({
        message: 'Purchase was not found or is no longer a draft',
      })
    }
    await writeAuditLog({
      actor: req.admin,
      action: 'receive',
      entityType: 'purchase',
      entityId: purchase._id,
      summary: purchase.purchaseNumber,
      details: { supplier: purchase.supplier.name, subtotal: purchase.subtotal },
    })
    res.json(purchase)
  } catch (error) {
    sendError(res, error)
  }
}

export const cancelPurchase = async (req, res) => {
  try {
    const purchase = await cancelDraftPurchase(
      req.params.id,
      req.admin.username,
    )
    if (!purchase) {
      return res.status(409).json({
        message: 'Only an existing draft purchase can be cancelled',
      })
    }
    await writeAuditLog({
      actor: req.admin,
      action: 'cancel',
      entityType: 'purchase',
      entityId: purchase._id,
      summary: purchase.purchaseNumber,
    })
    res.json(purchase)
  } catch (error) {
    sendError(res, error)
  }
}
