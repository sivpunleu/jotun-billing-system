import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getStorageMode } from '../config/db.js'
import Invoice from '../models/Invoice.js'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))
const dataDirectory = path.resolve(currentDirectory, '../data')
const dataFile = path.join(dataDirectory, 'invoices.json')

let writeQueue = Promise.resolve()

const readLocalInvoices = async () => {
  try {
    const contents = await readFile(dataFile, 'utf8')
    const invoices = JSON.parse(contents)
    return Array.isArray(invoices) ? invoices : []
  } catch (error) {
    if (error.code === 'ENOENT') return []
    throw error
  }
}

const writeLocalInvoices = async (invoices) => {
  writeQueue = writeQueue.then(async () => {
    await mkdir(dataDirectory, { recursive: true })
    await writeFile(dataFile, `${JSON.stringify(invoices, null, 2)}\n`, 'utf8')
  })
  return writeQueue
}

const duplicateInvoiceError = () => {
  const error = new Error('Invoice number already exists')
  error.code = 11000
  return error
}

export const listInvoices = async (search = '') => {
  if (getStorageMode() === 'mongodb') {
    const safeQuery = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const filter = search
      ? {
          $or: [
            { invoiceNumber: { $regex: safeQuery, $options: 'i' } },
            { 'customer.name': { $regex: safeQuery, $options: 'i' } },
            { 'customer.phone': { $regex: safeQuery, $options: 'i' } },
          ],
        }
      : {}

    return Invoice.find(filter).sort({ createdAt: -1 })
  }

  const invoices = await readLocalInvoices()
  const query = search.toLocaleLowerCase()
  return invoices
    .filter((invoice) => {
      if (!query) return true
      return [
        invoice.invoiceNumber,
        invoice.customer?.name,
        invoice.customer?.phone,
      ].some((value) => String(value || '').toLocaleLowerCase().includes(query))
    })
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
}

export const findInvoiceById = async (id) => {
  if (getStorageMode() === 'mongodb') {
    return Invoice.findById(id)
  }

  const invoices = await readLocalInvoices()
  return invoices.find((invoice) => String(invoice._id) === String(id)) || null
}

export const insertInvoice = async (payload) => {
  if (getStorageMode() === 'mongodb') {
    return Invoice.create(payload)
  }

  const invoices = await readLocalInvoices()
  const duplicate = invoices.some(
    (invoice) =>
      String(invoice.invoiceNumber).toUpperCase() ===
      String(payload.invoiceNumber).toUpperCase(),
  )
  if (duplicate) throw duplicateInvoiceError()

  const timestamp = new Date().toISOString()
  const invoice = {
    ...payload,
    invoiceNumber: String(payload.invoiceNumber).toUpperCase(),
    _id: randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  invoices.push(invoice)
  await writeLocalInvoices(invoices)
  return invoice
}

export const replaceInvoice = async (id, payload) => {
  if (getStorageMode() === 'mongodb') {
    return Invoice.findByIdAndUpdate(id, payload, {
      new: true,
      runValidators: true,
    })
  }

  const invoices = await readLocalInvoices()
  const index = invoices.findIndex(
    (invoice) => String(invoice._id) === String(id),
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
    ...payload,
    invoiceNumber: String(payload.invoiceNumber).toUpperCase(),
    _id: invoices[index]._id,
    createdAt: invoices[index].createdAt,
    updatedAt: new Date().toISOString(),
  }
  invoices[index] = invoice
  await writeLocalInvoices(invoices)
  return invoice
}

export const removeInvoice = async (id) => {
  if (getStorageMode() === 'mongodb') {
    return Invoice.findByIdAndDelete(id)
  }

  const invoices = await readLocalInvoices()
  const index = invoices.findIndex(
    (invoice) => String(invoice._id) === String(id),
  )
  if (index === -1) return null

  const [invoice] = invoices.splice(index, 1)
  await writeLocalInvoices(invoices)
  return invoice
}
