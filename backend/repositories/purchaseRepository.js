import { randomUUID } from 'node:crypto'
import mongoose from 'mongoose'
import { getStorageMode } from '../config/db.js'
import Counter from '../models/Counter.js'
import Product from '../models/Product.js'
import Purchase from '../models/Purchase.js'
import {
  mutateLocalCollection,
  readLocalCollection,
} from './localStore.js'

const roundMoney = (value) => Math.round(Number(value || 0) * 100) / 100

const normalizePagination = (page, limit) => ({
  page: Math.max(1, Number(page) || 1),
  limit: Math.min(100, Math.max(1, Number(limit) || 10)),
})

const purchaseSearchMatches = (purchase, search) => {
  const query = String(search || '').trim().toLocaleLowerCase()
  if (!query) return true
  return [purchase.purchaseNumber, purchase.supplier?.name].some((value) =>
    String(value || '').toLocaleLowerCase().includes(query),
  )
}

export const listPurchases = async ({
  search = '',
  status = '',
  page = 1,
  limit = 10,
} = {}) => {
  const pagination = normalizePagination(page, limit)

  if (getStorageMode() === 'mongodb') {
    const filter = {}
    const safeSearch = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (safeSearch) {
      filter.$or = [
        { purchaseNumber: { $regex: safeSearch, $options: 'i' } },
        { 'supplier.name': { $regex: safeSearch, $options: 'i' } },
      ]
    }
    if (['draft', 'received', 'cancelled'].includes(status)) {
      filter.status = status
    }
    const [items, total] = await Promise.all([
      Purchase.find(filter)
        .sort({ purchaseDate: -1, createdAt: -1 })
        .skip((pagination.page - 1) * pagination.limit)
        .limit(pagination.limit),
      Purchase.countDocuments(filter),
    ])
    return { items, total, ...pagination }
  }

  const records = (await readLocalCollection('purchases'))
    .filter((purchase) => purchaseSearchMatches(purchase, search))
    .filter((purchase) => !status || purchase.status === status)
    .sort(
      (left, right) =>
        new Date(right.purchaseDate || right.createdAt) -
        new Date(left.purchaseDate || left.createdAt),
    )
  const offset = (pagination.page - 1) * pagination.limit
  return {
    items: records.slice(offset, offset + pagination.limit),
    total: records.length,
    ...pagination,
  }
}

export const findPurchaseById = async (id) => {
  if (getStorageMode() === 'mongodb') return Purchase.findById(id)
  const purchases = await readLocalCollection('purchases')
  return purchases.find((item) => String(item._id) === String(id)) || null
}

export const reservePurchaseNumber = async (dateValue = new Date()) => {
  const year = new Date(dateValue).getFullYear()
  const counterId = `purchase-${year}`

  if (getStorageMode() === 'mongodb') {
    const counter = await Counter.findByIdAndUpdate(
      counterId,
      { $inc: { sequence: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    )
    return `PO-${year}-${String(counter.sequence).padStart(5, '0')}`
  }

  return mutateLocalCollection('counters', (counters) => {
    let counter = counters.find((item) => item._id === counterId)
    if (!counter) {
      counter = { _id: counterId, sequence: 0 }
      counters.push(counter)
    }
    counter.sequence += 1
    return `PO-${year}-${String(counter.sequence).padStart(5, '0')}`
  })
}

export const insertPurchase = async (payload) => {
  if (getStorageMode() === 'mongodb') return Purchase.create(payload)
  return mutateLocalCollection('purchases', (purchases) => {
    if (
      purchases.some(
        (item) =>
          String(item.purchaseNumber).toUpperCase() ===
          String(payload.purchaseNumber).toUpperCase(),
      )
    ) {
      const error = new Error('Purchase number already exists')
      error.code = 11000
      throw error
    }
    const timestamp = new Date().toISOString()
    const purchase = {
      ...payload,
      _id: randomUUID(),
      status: 'draft',
      receivedAt: null,
      cancelledAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    purchases.push(purchase)
    return purchase
  })
}

export const replaceDraftPurchase = async (id, payload) => {
  if (getStorageMode() === 'mongodb') {
    return Purchase.findOneAndUpdate(
      { _id: id, status: 'draft' },
      payload,
      { new: true, runValidators: true },
    )
  }
  return mutateLocalCollection('purchases', (purchases) => {
    const index = purchases.findIndex(
      (item) => String(item._id) === String(id) && item.status === 'draft',
    )
    if (index === -1) return null
    purchases[index] = {
      ...purchases[index],
      ...payload,
      _id: purchases[index]._id,
      purchaseNumber: purchases[index].purchaseNumber,
      status: 'draft',
      createdAt: purchases[index].createdAt,
      updatedAt: new Date().toISOString(),
    }
    return purchases[index]
  })
}

const calculateWeightedCost = ({
  previousStock,
  previousCost,
  incomingQuantity,
  incomingCost,
}) => {
  const resultingStock = previousStock + incomingQuantity
  if (resultingStock <= 0) return roundMoney(incomingCost)
  return roundMoney(
    (previousStock * previousCost + incomingQuantity * incomingCost) /
      resultingStock,
  )
}

export const receiveDraftPurchase = async (id, actor) => {
  if (getStorageMode() === 'mongodb') {
    const session = await mongoose.startSession()
    let receivedPurchase = null
    try {
      await session.withTransaction(async () => {
        receivedPurchase = null
        const purchase = await Purchase.findOne({
          _id: id,
          status: 'draft',
        }).session(session)
        if (!purchase) return

        const products = await Product.find({
          _id: { $in: purchase.items.map((item) => item.productId) },
          deletedAt: null,
        }).session(session)
        const productMap = new Map(
          products.map((product) => [String(product._id), product]),
        )
        if (productMap.size !== purchase.items.length) {
          throw new Error('One or more purchase products are unavailable')
        }

        for (const item of purchase.items) {
          const product = productMap.get(String(item.productId))
          const previousStock = Number(product.stockQuantity || 0)
          const previousCost = Number(product.costPrice || 0)
          const quantity = Number(item.quantity)
          const unitCost = Number(item.unitCost)
          const resultingStock = roundMoney(previousStock + quantity)
          const resultingCost = calculateWeightedCost({
            previousStock,
            previousCost,
            incomingQuantity: quantity,
            incomingCost: unitCost,
          })

          product.stockQuantity = resultingStock
          product.costPrice = resultingCost
          product.updatedBy = actor
          product.stockMovements.push({
            type: 'in',
            quantity,
            previousStock,
            resultingStock,
            note: `Purchase ${purchase.purchaseNumber}`,
            recordedBy: actor,
            recordedAt: new Date(),
            referenceType: 'purchase',
            referenceId: String(purchase._id),
            unitCost,
          })
          await product.save({ session })

          item.previousStock = previousStock
          item.previousCostPrice = previousCost
          item.resultingCostPrice = resultingCost
        }

        purchase.status = 'received'
        purchase.receivedAt = new Date()
        purchase.receivedBy = actor
        purchase.updatedBy = actor
        await purchase.save({ session })
        receivedPurchase = purchase
      })
      return receivedPurchase
    } finally {
      await session.endSession()
    }
  }

  const purchase = await mutateLocalCollection('purchases', (purchases) => {
    const draft = purchases.find(
      (item) => String(item._id) === String(id) && item.status === 'draft',
    )
    if (!draft) return null
    draft.status = 'receiving'
    draft.updatedAt = new Date().toISOString()
    return structuredClone(draft)
  })
  if (!purchase) return null

  try {
    const allProducts = await readLocalCollection('products')
    const activeProducts = new Map(
      allProducts
        .filter((product) => !product.deletedAt)
        .map((product) => [String(product._id), product]),
    )
    if (
      purchase.items.some(
        (item) => !activeProducts.has(String(item.productId)),
      )
    ) {
      throw new Error('One or more purchase products are unavailable')
    }

    const receivedItems = []
    await mutateLocalCollection('products', (products) => {
      for (const item of purchase.items) {
        const product = products.find(
          (candidate) =>
            String(candidate._id) === String(item.productId) &&
            !candidate.deletedAt,
        )
        const previousStock = Number(product.stockQuantity || 0)
        const previousCost = Number(product.costPrice || 0)
        const quantity = Number(item.quantity)
        const unitCost = Number(item.unitCost)
        const resultingStock = roundMoney(previousStock + quantity)
        const resultingCost = calculateWeightedCost({
          previousStock,
          previousCost,
          incomingQuantity: quantity,
          incomingCost: unitCost,
        })
        const timestamp = new Date().toISOString()

        product.stockQuantity = resultingStock
        product.costPrice = resultingCost
        product.updatedBy = actor
        product.updatedAt = timestamp
        product.stockMovements = Array.isArray(product.stockMovements)
          ? product.stockMovements
          : []
        product.stockMovements.push({
          _id: randomUUID(),
          type: 'in',
          quantity,
          previousStock,
          resultingStock,
          note: `Purchase ${purchase.purchaseNumber}`,
          recordedBy: actor,
          recordedAt: timestamp,
          referenceType: 'purchase',
          referenceId: String(purchase._id),
          unitCost,
        })
        receivedItems.push({
          ...item,
          previousStock,
          previousCostPrice: previousCost,
          resultingCostPrice: resultingCost,
        })
      }
    })

    return mutateLocalCollection('purchases', (purchases) => {
      const record = purchases.find(
        (item) =>
          String(item._id) === String(id) && item.status === 'receiving',
      )
      if (!record) return null
      const timestamp = new Date().toISOString()
      record.items = receivedItems
      record.status = 'received'
      record.receivedAt = timestamp
      record.receivedBy = actor
      record.updatedBy = actor
      record.updatedAt = timestamp
      return record
    })
  } catch (error) {
    await mutateLocalCollection('purchases', (purchases) => {
      const record = purchases.find(
        (item) =>
          String(item._id) === String(id) && item.status === 'receiving',
      )
      if (record) record.status = 'draft'
      return record || null
    })
    throw error
  }
}

export const cancelDraftPurchase = async (id, actor) => {
  const timestamp = new Date()
  if (getStorageMode() === 'mongodb') {
    return Purchase.findOneAndUpdate(
      { _id: id, status: 'draft' },
      {
        status: 'cancelled',
        cancelledAt: timestamp,
        cancelledBy: actor,
        updatedBy: actor,
      },
      { new: true, runValidators: true },
    )
  }
  return mutateLocalCollection('purchases', (purchases) => {
    const purchase = purchases.find(
      (item) => String(item._id) === String(id) && item.status === 'draft',
    )
    if (!purchase) return null
    purchase.status = 'cancelled'
    purchase.cancelledAt = timestamp.toISOString()
    purchase.cancelledBy = actor
    purchase.updatedBy = actor
    purchase.updatedAt = timestamp.toISOString()
    return purchase
  })
}

export const getAllPurchases = async () => {
  if (getStorageMode() === 'mongodb') {
    return Purchase.find({}).sort({ createdAt: -1 }).lean()
  }
  return readLocalCollection('purchases')
}
