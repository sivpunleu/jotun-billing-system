import mongoose from 'mongoose'
import {
  findInvoiceById,
  insertInvoice,
  listInvoices,
  removeInvoice,
  replaceInvoice,
} from '../repositories/invoiceRepository.js'

const roundMoney = (value) => {
  const numericValue =
    value === undefined || value === null || value === '' ? 0 : Number(value)
  return Math.round((numericValue + Number.EPSILON) * 100) / 100
}

export const calculateTotals = (payload) => {
  const items = (payload.items || []).map((item) => {
    const quantity = Number(item.quantity)
    const unitPrice = Number(item.unitPrice)
    const discount = Number(item.discount || 0)

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error('Each item quantity must be greater than zero')
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error('Each item unit price must be zero or greater')
    }
    if (!Number.isFinite(discount) || discount < 0) {
      throw new Error('Each item discount must be zero or greater')
    }

    const baseTotal = quantity * unitPrice
    if (discount > baseTotal) {
      throw new Error('Item discount cannot exceed its line total')
    }

    return {
      description: String(item.description || '').trim(),
      colorCode: String(item.colorCode || '').trim(),
      quantity,
      unitPrice: roundMoney(unitPrice),
      discount: roundMoney(discount),
      total: roundMoney(baseTotal - discount),
    }
  })

  if (!items.length) {
    throw new Error('At least one invoice item is required')
  }
  if (items.some((item) => !item.description)) {
    throw new Error('Every item needs a description')
  }

  const subtotal = roundMoney(items.reduce((sum, item) => sum + item.total, 0))
  const discount = roundMoney(Number(payload.discount || 0))
  const taxRate = roundMoney(Number(payload.taxRate || 0))
  const deliveryFee = roundMoney(Number(payload.deliveryFee || 0))
  const depositRate = roundMoney(Number(payload.depositRate || 0))

  if (!Number.isFinite(discount)) {
    throw new Error('Invoice discount must be a valid number')
  }
  if (!Number.isFinite(taxRate)) {
    throw new Error('Tax rate must be a valid number')
  }
  if (!Number.isFinite(deliveryFee)) {
    throw new Error('Delivery fee must be a valid number')
  }
  if (!Number.isFinite(depositRate)) {
    throw new Error('Deposit rate must be a valid number')
  }
  if (discount < 0 || discount > subtotal) {
    throw new Error('Invoice discount must be between zero and the subtotal')
  }
  if (taxRate < 0 || taxRate > 100) {
    throw new Error('Tax rate must be between zero and 100')
  }
  if (deliveryFee < 0) {
    throw new Error('Delivery fee cannot be negative')
  }
  if (depositRate < 0 || depositRate > 100) {
    throw new Error('Deposit rate must be between zero and 100')
  }

  const taxableAmount = subtotal - discount
  const taxAmount = roundMoney(taxableAmount * (taxRate / 100))
  const grandTotal = roundMoney(taxableAmount + taxAmount + deliveryFee)
  const depositAmount = roundMoney(grandTotal * (depositRate / 100))

  return {
    items,
    subtotal,
    discount,
    taxRate,
    taxAmount,
    deliveryFee,
    depositRate,
    depositAmount,
    grandTotal,
    balanceDue: roundMoney(grandTotal - depositAmount),
  }
}

const normalizeInvoice = (body) => {
  const invoiceNumber = String(body.invoiceNumber || '').trim()
  const customerName = String(body.customer?.name || '').trim()
  const invoiceDate = new Date(body.invoiceDate)
  const dueDate = new Date(body.dueDate)

  if (!invoiceNumber) {
    throw new Error('Invoice number is required')
  }
  if (!customerName) {
    throw new Error('Customer name is required')
  }
  if (Number.isNaN(invoiceDate.getTime()) || Number.isNaN(dueDate.getTime())) {
    throw new Error('Invoice date and due date must be valid')
  }

  const totals = calculateTotals(body)

  return {
    invoiceNumber,
    invoiceDate: invoiceDate.toISOString(),
    dueDate: dueDate.toISOString(),
    customer: {
      name: customerName,
      phone: String(body.customer?.phone || '').trim(),
      address: String(body.customer?.address || '').trim(),
    },
    paymentStatus: ['unpaid', 'partial', 'paid'].includes(body.paymentStatus)
      ? body.paymentStatus
      : 'unpaid',
    notes: String(body.notes || '').trim(),
    ...totals,
  }
}

const sendError = (res, error) => {
  if (error.code === 11000) {
    return res.status(409).json({ message: 'Invoice number already exists' })
  }
  if (error instanceof mongoose.Error.ValidationError) {
    const message = Object.values(error.errors)
      .map((item) => item.message)
      .join(', ')
    return res.status(400).json({ message })
  }
  if (error.name === 'CastError') {
    return res.status(400).json({ message: 'Invalid invoice ID' })
  }
  return res.status(400).json({ message: error.message || 'Request failed' })
}

export const getInvoices = async (req, res) => {
  try {
    const query = String(req.query.search || '').trim()
    const invoices = await listInvoices(query)
    res.json(invoices)
  } catch (error) {
    sendError(res, error)
  }
}

export const getInvoiceById = async (req, res) => {
  try {
    const invoice = await findInvoiceById(req.params.id)
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' })
    }
    res.json(invoice)
  } catch (error) {
    sendError(res, error)
  }
}

export const createInvoice = async (req, res) => {
  try {
    const invoice = await insertInvoice(normalizeInvoice(req.body))
    res.status(201).json(invoice)
  } catch (error) {
    sendError(res, error)
  }
}

export const updateInvoice = async (req, res) => {
  try {
    const invoice = await replaceInvoice(
      req.params.id,
      normalizeInvoice(req.body),
    )

    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' })
    }
    res.json(invoice)
  } catch (error) {
    sendError(res, error)
  }
}

export const deleteInvoice = async (req, res) => {
  try {
    const invoice = await removeInvoice(req.params.id)
    if (!invoice) {
      return res.status(404).json({ message: 'Invoice not found' })
    }
    res.json({ message: 'Invoice deleted successfully' })
  } catch (error) {
    sendError(res, error)
  }
}
