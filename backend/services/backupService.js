import mongoose from 'mongoose'
import { getStorageMode } from '../config/db.js'
import { getAllAdminsForBackup } from '../repositories/adminRepository.js'
import {
  findBackupSnapshotById,
  findBackupSnapshotForDate,
  listBackupSnapshots,
  pruneAutomaticBackupSnapshots,
  saveBackupSnapshot,
} from '../repositories/backupRepository.js'
import { getAllAuditLogs, writeAuditLog } from '../repositories/auditRepository.js'
import { getAllCatalogRecords } from '../repositories/catalogRepository.js'
import { getAllInvoices } from '../repositories/invoiceRepository.js'
import {
  defaultSystemSettings,
  getSystemSettings,
} from '../repositories/settingsRepository.js'
import { mutateLocalCollection, readLocalCollection } from '../repositories/localStore.js'
import AuditLog from '../models/AuditLog.js'
import Counter from '../models/Counter.js'
import Customer from '../models/Customer.js'
import Invoice from '../models/Invoice.js'
import Product from '../models/Product.js'
import Purchase from '../models/Purchase.js'
import Salesperson from '../models/Salesperson.js'
import Supplier from '../models/Supplier.js'
import SystemSetting from '../models/SystemSetting.js'
import { createShareTokenExpiration } from '../utils/shareToken.js'
import { getAllPurchases } from '../repositories/purchaseRepository.js'

export const BACKUP_FORMAT_VERSION = 3

const backupCollectionNames = [
  'invoices',
  'customers',
  'products',
  'salespeople',
  'suppliers',
  'purchases',
  'auditLogs',
  'counters',
]

const clone = (value) => JSON.parse(JSON.stringify(value ?? null))

const cleanPlainRecord = (record) => {
  const plain = clone(record) || {}
  delete plain.id
  delete plain.__v
  return plain
}

const cleanMongoObjectIds = (value) => {
  if (Array.isArray(value)) {
    return value.map(cleanMongoObjectIds)
  }
  if (!value || typeof value !== 'object') return value

  const cleaned = {}
  for (const [key, item] of Object.entries(value)) {
    if (key === '_id' && item && !mongoose.isValidObjectId(item)) {
      continue
    }
    cleaned[key] = cleanMongoObjectIds(item)
  }
  return cleaned
}

const cleanMongoRecord = (record) => cleanMongoObjectIds(cleanPlainRecord(record))

const countsForPayload = (payload) => ({
  invoices: payload.invoices.length,
  customers: payload.customers.length,
  products: payload.products.length,
  salespeople: payload.salespeople.length,
  suppliers: payload.suppliers.length,
  purchases: payload.purchases.length,
  auditLogs: payload.auditLogs.length,
  counters: payload.counters.length,
  admins: payload.admins.length,
  settings: payload.settings ? 1 : 0,
})

const readCounters = async () => {
  if (getStorageMode() === 'mongodb') {
    return Counter.find({}).lean()
  }
  return readLocalCollection('counters')
}

const deriveCountersFromRecords = (invoices = [], purchases = []) => {
  const counters = new Map()
  for (const invoice of invoices) {
    const match = String(invoice.invoiceNumber || '').match(
      /^INV-(\d{4})-(\d{5})$/,
    )
    if (!match) continue
    const year = match[1]
    const sequence = Number(match[2])
    const counterId = `invoice-${year}`
    counters.set(counterId, Math.max(counters.get(counterId) || 0, sequence))
  }
  for (const purchase of purchases) {
    const match = String(purchase.purchaseNumber || '').match(
      /^PO-(\d{4})-(\d{5})$/,
    )
    if (!match) continue
    const year = match[1]
    const sequence = Number(match[2])
    const counterId = `purchase-${year}`
    counters.set(counterId, Math.max(counters.get(counterId) || 0, sequence))
  }
  return Array.from(counters.entries()).map(([_id, sequence]) => ({
    _id,
    sequence,
  }))
}

const normalizeArray = (payload, key) => {
  if (!Array.isArray(payload[key])) {
    throw new Error(`Backup is missing ${key}`)
  }
  return payload[key].map(cleanPlainRecord)
}

const normalizeInvoiceShareAccess = (invoices) => {
  return invoices.map((invoice) => {
    const shareToken = String(invoice.shareToken || '').trim()
    return {
      ...invoice,
      shareToken,
      shareTokenExpiresAt: shareToken
        ? invoice.shareTokenExpiresAt ||
          createShareTokenExpiration().toISOString()
        : null,
      shareTokenRevokedAt: shareToken
        ? invoice.shareTokenRevokedAt || null
        : null,
    }
  })
}

const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const fieldPath = (collection, index, field = '') =>
  `${collection}[${index}]${field ? `.${field}` : ''}`

const addError = (errors, collection, index, field, message) => {
  errors.push(`${fieldPath(collection, index, field)}: ${message}`)
}

const assertPlainRecord = (record, errors, collection, index) => {
  if (!isPlainObject(record)) {
    addError(errors, collection, index, '', 'must be an object')
    return false
  }
  return true
}

const requireString = (record, field, errors, collection, index) => {
  if (!String(record[field] || '').trim()) {
    addError(errors, collection, index, field, 'is required')
  }
}

const requireId = (record, field, errors, collection, index) => {
  const value = record[field]
  if (value === undefined || value === null || !String(value).trim()) {
    addError(errors, collection, index, field, 'is required')
  }
}

const validateNumber = (
  record,
  field,
  errors,
  collection,
  index,
  { required = false, min = null, max = null } = {},
) => {
  const value = record[field]
  if (value === undefined || value === null || value === '') {
    if (required) addError(errors, collection, index, field, 'is required')
    return
  }
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) {
    addError(errors, collection, index, field, 'must be a valid number')
    return
  }
  if (min !== null && numericValue < min) {
    addError(errors, collection, index, field, `must be at least ${min}`)
  }
  if (max !== null && numericValue > max) {
    addError(errors, collection, index, field, `must be at most ${max}`)
  }
}

const validateDate = (
  record,
  field,
  errors,
  collection,
  index,
  { required = false } = {},
) => {
  const value = record[field]
  if (value === undefined || value === null || value === '') {
    if (required) addError(errors, collection, index, field, 'is required')
    return
  }
  if (Number.isNaN(new Date(value).getTime())) {
    addError(errors, collection, index, field, 'must be a valid date')
  }
}

const validateEnum = (
  record,
  field,
  values,
  errors,
  collection,
  index,
) => {
  const value = record[field]
  if (value === undefined || value === null || value === '') return
  if (!values.includes(value)) {
    addError(
      errors,
      collection,
      index,
      field,
      `must be one of ${values.join(', ')}`,
    )
  }
}

const validateArray = (
  record,
  field,
  errors,
  collection,
  index,
  { required = false, minLength = 0 } = {},
) => {
  const value = record[field]
  if (value === undefined || value === null) {
    if (required) addError(errors, collection, index, field, 'is required')
    return []
  }
  if (!Array.isArray(value)) {
    addError(errors, collection, index, field, 'must be an array')
    return []
  }
  if (value.length < minLength) {
    addError(
      errors,
      collection,
      index,
      field,
      `must contain at least ${minLength} item(s)`,
    )
  }
  return value
}

const validateNestedObject = (
  record,
  field,
  errors,
  collection,
  index,
  { required = false } = {},
) => {
  const value = record[field]
  if (value === undefined || value === null) {
    if (required) addError(errors, collection, index, field, 'is required')
    return null
  }
  if (!isPlainObject(value)) {
    addError(errors, collection, index, field, 'must be an object')
    return null
  }
  return value
}

const validateUniqueValues = (
  records,
  { collection, field, label = field, normalize = (value) => value },
  errors,
) => {
  const seen = new Map()
  records.forEach((record, index) => {
    const rawValue = record?.[field]
    if (rawValue === undefined || rawValue === null || rawValue === '') return
    const value = normalize(rawValue)
    if (!value) return
    if (seen.has(value)) {
      addError(
        errors,
        collection,
        index,
        field,
        `${label} duplicates ${fieldPath(collection, seen.get(value), field)}`,
      )
      return
    }
    seen.set(value, index)
  })
}

const validateInvoiceRecord = (invoice, errors, collection, index) => {
  if (!assertPlainRecord(invoice, errors, collection, index)) return
  requireString(invoice, 'invoiceNumber', errors, collection, index)
  validateDate(invoice, 'invoiceDate', errors, collection, index, {
    required: true,
  })
  validateDate(invoice, 'dueDate', errors, collection, index, {
    required: true,
  })
  validateDate(invoice, 'shareTokenExpiresAt', errors, collection, index)
  validateDate(invoice, 'shareTokenRevokedAt', errors, collection, index)
  validateEnum(
    invoice,
    'status',
    ['draft', 'unpaid', 'partially_paid', 'paid', 'cancelled'],
    errors,
    collection,
    index,
  )
  validateEnum(
    invoice,
    'paymentStatus',
    ['unpaid', 'partial', 'paid'],
    errors,
    collection,
    index,
  )
  validateEnum(
    invoice,
    'salesChannel',
    ['store', 'salesperson'],
    errors,
    collection,
    index,
  )
  const invoiceNumberFields = [
    ['subtotal', true, 0],
    ['discount', false, 0],
    ['taxRate', false, 0, 100],
    ['taxAmount', false, 0],
    ['deliveryFee', false, 0],
    ['depositRate', false, 0, 100],
    ['depositAmount', false, 0],
    ['grandTotal', true, 0],
    ['balanceDue', true, 0],
    ['paidAmount', false, 0],
  ]
  invoiceNumberFields.forEach(([field, required, min, max]) => {
    validateNumber(invoice, field, errors, collection, index, {
      required,
      min,
      max,
    })
  })

  const customer = validateNestedObject(
    invoice,
    'customer',
    errors,
    collection,
    index,
    { required: true },
  )
  if (customer) requireString(customer, 'name', errors, collection, index)

  validateArray(invoice, 'items', errors, collection, index, {
    required: true,
    minLength: 1,
  }).forEach((item, itemIndex) => {
    const itemCollection = `${collection}[${index}].items`
    if (!assertPlainRecord(item, errors, itemCollection, itemIndex)) return
    requireString(item, 'description', errors, itemCollection, itemIndex)
    validateNumber(item, 'quantity', errors, itemCollection, itemIndex, {
      required: true,
      min: 0.01,
    })
    validateNumber(item, 'unitPrice', errors, itemCollection, itemIndex, {
      required: true,
      min: 0,
    })
    validateNumber(item, 'costPrice', errors, itemCollection, itemIndex, {
      min: 0,
    })
    validateNumber(item, 'discount', errors, itemCollection, itemIndex, {
      min: 0,
    })
    validateNumber(item, 'total', errors, itemCollection, itemIndex, {
      required: true,
      min: 0,
    })
  })

  validateArray(invoice, 'payments', errors, collection, index).forEach(
    (payment, paymentIndex) => {
      const paymentCollection = `${collection}[${index}].payments`
      if (!assertPlainRecord(payment, errors, paymentCollection, paymentIndex)) {
        return
      }
      validateNumber(
        payment,
        'amount',
        errors,
        paymentCollection,
        paymentIndex,
        { required: true, min: 0.01 },
      )
      validateDate(payment, 'paidAt', errors, paymentCollection, paymentIndex, {
        required: true,
      })
      requireString(payment, 'receivedBy', errors, paymentCollection, paymentIndex)
    },
  )
}

const validateCustomerRecord = (record, errors, collection, index) => {
  if (!assertPlainRecord(record, errors, collection, index)) return
  requireString(record, 'name', errors, collection, index)
  validateDate(record, 'deletedAt', errors, collection, index)
}

const validateProductRecord = (product, errors, collection, index) => {
  if (!assertPlainRecord(product, errors, collection, index)) return
  requireString(product, 'name', errors, collection, index)
  requireString(product, 'unit', errors, collection, index)
  validateNumber(product, 'unitPrice', errors, collection, index, {
    required: true,
    min: 0,
  })
  validateNumber(product, 'costPrice', errors, collection, index, { min: 0 })
  validateNumber(product, 'stockQuantity', errors, collection, index, { min: 0 })
  validateNumber(product, 'lowStockThreshold', errors, collection, index, {
    min: 0,
  })
  validateDate(product, 'deletedAt', errors, collection, index)

  validateArray(product, 'stockMovements', errors, collection, index).forEach(
    (movement, movementIndex) => {
      const movementCollection = `${collection}[${index}].stockMovements`
      if (!assertPlainRecord(movement, errors, movementCollection, movementIndex)) {
        return
      }
      validateEnum(
        movement,
        'type',
        ['in', 'out', 'set'],
        errors,
        movementCollection,
        movementIndex,
      )
      const stockMovementNumberFields = [
        'quantity',
        'previousStock',
        'resultingStock',
        'unitCost',
      ]
      stockMovementNumberFields.forEach((field) => {
        validateNumber(
          movement,
          field,
          errors,
          movementCollection,
          movementIndex,
          { min: 0 },
        )
      })
      validateDate(
        movement,
        'recordedAt',
        errors,
        movementCollection,
        movementIndex,
      )
    },
  )
}

const validateSupplierRecord = (record, errors, collection, index) => {
  if (!assertPlainRecord(record, errors, collection, index)) return
  requireString(record, 'name', errors, collection, index)
  validateDate(record, 'deletedAt', errors, collection, index)
}

const validatePurchaseRecord = (purchase, errors, collection, index) => {
  if (!assertPlainRecord(purchase, errors, collection, index)) return
  requireString(purchase, 'purchaseNumber', errors, collection, index)
  validateDate(purchase, 'purchaseDate', errors, collection, index, {
    required: true,
  })
  requireId(purchase, 'supplierId', errors, collection, index)
  validateEnum(
    purchase,
    'status',
    ['draft', 'receiving', 'received', 'cancelled'],
    errors,
    collection,
    index,
  )
  validateNumber(purchase, 'subtotal', errors, collection, index, {
    required: true,
    min: 0,
  })
  validateDate(purchase, 'receivedAt', errors, collection, index)
  validateDate(purchase, 'cancelledAt', errors, collection, index)

  const supplier = validateNestedObject(
    purchase,
    'supplier',
    errors,
    collection,
    index,
    { required: true },
  )
  if (supplier) requireString(supplier, 'name', errors, collection, index)

  validateArray(purchase, 'items', errors, collection, index, {
    required: true,
    minLength: 1,
  }).forEach((item, itemIndex) => {
    const itemCollection = `${collection}[${index}].items`
    if (!assertPlainRecord(item, errors, itemCollection, itemIndex)) return
    requireId(item, 'productId', errors, itemCollection, itemIndex)
    requireString(item, 'name', errors, itemCollection, itemIndex)
    validateNumber(item, 'quantity', errors, itemCollection, itemIndex, {
      required: true,
      min: 0.01,
    })
    validateNumber(item, 'unitCost', errors, itemCollection, itemIndex, {
      required: true,
      min: 0,
    })
    validateNumber(item, 'total', errors, itemCollection, itemIndex, {
      required: true,
      min: 0,
    })
    const purchaseCostSnapshotFields = [
      'previousStock',
      'previousCostPrice',
      'resultingCostPrice',
    ]
    purchaseCostSnapshotFields.forEach((field) => {
      validateNumber(item, field, errors, itemCollection, itemIndex, {
        min: 0,
      })
    })
  })
}

const validateAuditLogRecord = (record, errors, collection, index) => {
  if (!assertPlainRecord(record, errors, collection, index)) return
  requireString(record, 'actorUsername', errors, collection, index)
  requireString(record, 'action', errors, collection, index)
  requireString(record, 'entityType', errors, collection, index)
  validateDate(record, 'createdAt', errors, collection, index)
}

const validateCounterRecord = (record, errors, collection, index) => {
  if (!assertPlainRecord(record, errors, collection, index)) return
  requireString(record, '_id', errors, collection, index)
  validateNumber(record, 'sequence', errors, collection, index, { min: 0 })
}

const validateAdminBackupRecord = (record, errors, collection, index) => {
  if (!assertPlainRecord(record, errors, collection, index)) return
  requireString(record, 'username', errors, collection, index)
  validateEnum(
    record,
    'role',
    ['owner', 'admin', 'viewer'],
    errors,
    collection,
    index,
  )
  validateNumber(record, 'tokenVersion', errors, collection, index, {
    min: 0,
  })
  validateDate(record, 'lastLoginAt', errors, collection, index)
  if (record.passwordHash !== undefined) {
    addError(
      errors,
      collection,
      index,
      'passwordHash',
      'must not be present in backup restore payloads',
    )
  }
}

const validateSettingsRecord = (settings, errors, collection, index) => {
  if (!assertPlainRecord(settings, errors, collection, index)) return
  if (settings.phones !== undefined && !Array.isArray(settings.phones)) {
    addError(errors, collection, index, 'phones', 'must be an array')
  }
  validateNumber(settings, 'invoiceFontSize', errors, collection, index, {
    min: 9,
    max: 18,
  })
  validateEnum(
    settings,
    'invoicePaperSize',
    ['a4', 'a5'],
    errors,
    collection,
    index,
  )
}

const restoreValidationConfigs = [
  {
    key: 'invoices',
    Model: Invoice,
    records: (backup) => backup.invoices,
    validateRecord: validateInvoiceRecord,
    unique: [
      {
        field: 'invoiceNumber',
        label: 'invoice number',
        normalize: (value) => String(value).trim().toUpperCase(),
      },
      {
        field: 'shareToken',
        label: 'public share token',
        normalize: (value) => String(value).trim(),
      },
    ],
  },
  {
    key: 'customers',
    Model: Customer,
    records: (backup) => backup.customers,
    validateRecord: validateCustomerRecord,
  },
  {
    key: 'products',
    Model: Product,
    records: (backup) => backup.products,
    validateRecord: validateProductRecord,
    unique: [
      {
        field: 'itemCode',
        label: 'item code',
        normalize: (value) => String(value).trim().toUpperCase(),
      },
    ],
  },
  {
    key: 'salespeople',
    Model: Salesperson,
    records: (backup) => backup.salespeople,
    validateRecord: validateCustomerRecord,
  },
  {
    key: 'suppliers',
    Model: Supplier,
    records: (backup) => backup.suppliers,
    validateRecord: validateSupplierRecord,
  },
  {
    key: 'purchases',
    Model: Purchase,
    records: (backup) => backup.purchases,
    validateRecord: validatePurchaseRecord,
    unique: [
      {
        field: 'purchaseNumber',
        label: 'purchase number',
        normalize: (value) => String(value).trim().toUpperCase(),
      },
    ],
  },
  {
    key: 'auditLogs',
    Model: AuditLog,
    records: (backup) => backup.auditLogs,
    validateRecord: validateAuditLogRecord,
  },
  {
    key: 'counters',
    Model: Counter,
    records: (backup) => backup.counters,
    validateRecord: validateCounterRecord,
    preserveStringIds: true,
    unique: [{ field: '_id', label: 'counter id' }],
  },
  {
    key: 'settings',
    Model: SystemSetting,
    records: (backup) => [backup.settings],
    validateRecord: validateSettingsRecord,
  },
  {
    key: 'admins',
    records: (backup) => backup.admins,
    validateRecord: validateAdminBackupRecord,
    skipped: true,
    unique: [
      {
        field: 'username',
        label: 'admin username',
        normalize: (value) => String(value).trim().toLowerCase(),
      },
    ],
  },
]

const validateWithMongooseSchema = async (config, record, index, errors) => {
  if (!config.Model || config.skipped || getStorageMode() !== 'mongodb') return
  const cleanedRecord = config.preserveStringIds
    ? cleanPlainRecord(record)
    : cleanMongoRecord(record)
  const document = new config.Model(cleanedRecord)
  const validationError = document.validateSync()
  if (!validationError) return
  const details = Object.values(validationError.errors || {})
    .map((error) => error.message)
    .join('; ')
  addError(
    errors,
    config.key,
    index,
    '',
    details || validationError.message || 'fails schema validation',
  )
}

export const validateBackupForRestore = async (backup) => {
  const errors = []

  for (const config of restoreValidationConfigs) {
    const records = config.records(backup)
    if (!Array.isArray(records)) {
      errors.push(`${config.key}: must be an array`)
      continue
    }
    records.forEach((record, index) => {
      config.validateRecord(record, errors, config.key, index)
    })
    for (const uniqueCheck of config.unique || []) {
      validateUniqueValues(
        records,
        { collection: config.key, ...uniqueCheck },
        errors,
      )
    }
    for (let index = 0; index < records.length; index += 1) {
      // eslint-disable-next-line no-await-in-loop
      await validateWithMongooseSchema(config, records[index], index, errors)
    }
  }

  if (!isPlainObject(backup.metadata)) {
    errors.push('metadata: must be an object')
  }
  if (!isPlainObject(backup.settings)) {
    errors.push('settings: must be an object')
  }

  if (errors.length) {
    const error = new Error(
      `Backup validation failed: ${errors.slice(0, 5).join('; ')}`,
    )
    error.name = 'BackupValidationError'
    error.details = errors
    throw error
  }

  return {
    valid: true,
    counts: backup.metadata.counts,
    checkedCollections: restoreValidationConfigs.map((config) => config.key),
    restoredCollections: backupCollectionNames,
    skippedCollections: ['admins', 'backup-snapshots'],
  }
}

export const validateBackupRestorePayload = async (payload) => {
  const backup = normalizeBackupPayload(payload)
  return validateBackupForRestore(backup)
}

export const buildDatabaseBackup = async ({
  createdBy = 'system',
  source = 'manual',
} = {}) => {
  const [
    invoices,
    customers,
    products,
    salespeople,
    suppliers,
    purchases,
    admins,
    auditLogs,
    settings,
    counters,
  ] = await Promise.all([
    getAllInvoices(),
    getAllCatalogRecords('customers'),
    getAllCatalogRecords('products'),
    getAllCatalogRecords('salespeople'),
    getAllCatalogRecords('suppliers'),
    getAllPurchases(),
    getAllAdminsForBackup(),
    getAllAuditLogs(),
    getSystemSettings(),
    readCounters(),
  ])

  const payload = {
    metadata: {
      createdAt: new Date().toISOString(),
      createdBy,
      source,
      formatVersion: BACKUP_FORMAT_VERSION,
    },
    invoices: clone(invoices) || [],
    customers: clone(customers) || [],
    products: clone(products) || [],
    salespeople: clone(salespeople) || [],
    suppliers: clone(suppliers) || [],
    purchases: clone(purchases) || [],
    admins: clone(admins) || [],
    auditLogs: clone(auditLogs) || [],
    counters: clone(counters) || [],
    settings: clone(settings) || defaultSystemSettings,
  }
  payload.metadata.counts = countsForPayload(payload)
  return payload
}

export const normalizeBackupPayload = (payload) => {
  const backup = payload?.backup || payload
  if (!backup || typeof backup !== 'object') {
    throw new Error('Backup file is invalid')
  }

  const version = Number(backup.metadata?.formatVersion || 1)
  if (!Number.isFinite(version) || version < 1 || version > BACKUP_FORMAT_VERSION) {
    throw new Error('Backup format version is not supported')
  }

  const normalized = {
    metadata: {
      ...backup.metadata,
      formatVersion: version,
    },
    invoices: normalizeInvoiceShareAccess(normalizeArray(backup, 'invoices')),
    customers: normalizeArray(backup, 'customers'),
    products: normalizeArray(backup, 'products'),
    salespeople: normalizeArray(backup, 'salespeople'),
    suppliers: Array.isArray(backup.suppliers)
      ? backup.suppliers.map(cleanPlainRecord)
      : [],
    purchases: Array.isArray(backup.purchases)
      ? backup.purchases.map(cleanPlainRecord)
      : [],
    auditLogs: Array.isArray(backup.auditLogs)
      ? backup.auditLogs.map(cleanPlainRecord)
      : [],
    admins: Array.isArray(backup.admins) ? backup.admins.map(cleanPlainRecord) : [],
    counters: Array.isArray(backup.counters)
      ? backup.counters.map(cleanPlainRecord)
      : deriveCountersFromRecords(backup.invoices, backup.purchases),
    settings: cleanPlainRecord({
      ...defaultSystemSettings,
      ...(Array.isArray(backup.settings) ? backup.settings[0] : backup.settings),
      key: 'default',
    }),
  }
  normalized.metadata.counts = countsForPayload(normalized)
  return normalized
}

const replaceLocalCollection = async (name, records) =>
  mutateLocalCollection(name, (current) => {
    current.splice(0, current.length, ...records.map(cleanPlainRecord))
    return current.length
  })

const replaceMongoCollection = async (
  Model,
  records,
  { preserveStringIds = false } = {},
) => {
  await Model.deleteMany({})
  const cleanedRecords = records.map(
    preserveStringIds ? cleanPlainRecord : cleanMongoRecord,
  )
  if (cleanedRecords.length) {
    await Model.insertMany(cleanedRecords, { ordered: true })
  }
  return cleanedRecords.length
}

const restoreMongo = async (backup) => {
  await replaceMongoCollection(Invoice, backup.invoices)
  await replaceMongoCollection(Customer, backup.customers)
  await replaceMongoCollection(Product, backup.products)
  await replaceMongoCollection(Salesperson, backup.salespeople)
  await replaceMongoCollection(Supplier, backup.suppliers)
  await replaceMongoCollection(Purchase, backup.purchases)
  await replaceMongoCollection(AuditLog, backup.auditLogs)
  await replaceMongoCollection(Counter, backup.counters, {
    preserveStringIds: true,
  })

  await SystemSetting.deleteMany({})
  await SystemSetting.create(cleanMongoRecord(backup.settings))
}

const restoreLocal = async (backup) => {
  await replaceLocalCollection('invoices', backup.invoices)
  await replaceLocalCollection('customers', backup.customers)
  await replaceLocalCollection('products', backup.products)
  await replaceLocalCollection('salespeople', backup.salespeople)
  await replaceLocalCollection('suppliers', backup.suppliers)
  await replaceLocalCollection('purchases', backup.purchases)
  await replaceLocalCollection('audit-logs', backup.auditLogs)
  await replaceLocalCollection('counters', backup.counters)
  await replaceLocalCollection('system-settings', [backup.settings])
}

export const createBackupSnapshot = async ({
  type = 'manual',
  createdBy = 'system',
  reason = '',
  audit = true,
} = {}) => {
  const payload = await buildDatabaseBackup({ createdBy, source: type })
  const snapshot = await saveBackupSnapshot({
    type,
    label: `Jotun backup ${payload.metadata.createdAt.slice(0, 10)}`,
    createdBy,
    reason,
    counts: payload.metadata.counts,
    payload,
  })

  if (audit) {
    await writeAuditLog({
      actor: { username: createdBy },
      action: 'backup',
      entityType: 'database',
      entityId: snapshot._id,
      summary:
        type === 'automatic'
          ? 'Automatic daily backup'
          : type === 'pre_restore'
            ? 'Pre-restore safety backup'
            : 'Manual backup snapshot',
      details: { type, counts: payload.metadata.counts },
    })
  }

  const { payload: _payload, ...summary } =
    typeof snapshot.toObject === 'function' ? snapshot.toObject() : snapshot
  return summary
}

export const listDatabaseBackups = async (options = {}) =>
  listBackupSnapshots(options)

export const getBackupDownloadPayload = async (id) => {
  const snapshot = await findBackupSnapshotById(id)
  if (!snapshot) return null
  return {
    snapshot,
    payload: snapshot.payload,
  }
}

export const restoreDatabaseBackup = async (
  payload,
  { actor, sourceSnapshotId = '', dryRun = false } = {},
) => {
  const backup = normalizeBackupPayload(payload)
  const validation = await validateBackupForRestore(backup)
  if (dryRun) {
    return {
      counts: backup.metadata.counts,
      validation,
      dryRun: true,
    }
  }

  const actorName = actor?.username || 'system'
  const safetySnapshot = await createBackupSnapshot({
    type: 'pre_restore',
    createdBy: actorName,
    reason: sourceSnapshotId
      ? `Before restoring snapshot ${sourceSnapshotId}`
      : 'Before restoring uploaded backup',
  })

  if (getStorageMode() === 'mongodb') {
    await restoreMongo(backup)
  } else {
    await restoreLocal(backup)
  }

  await writeAuditLog({
    actor,
    action: 'restore_backup',
    entityType: 'database',
    entityId: sourceSnapshotId,
    summary: 'Database restored from backup',
    details: {
      sourceSnapshotId,
      safetySnapshotId: safetySnapshot._id,
      counts: backup.metadata.counts,
      restoredCollections: backupCollectionNames,
      skippedCollections: ['admins', 'backup-snapshots'],
      validation,
    },
  })

  return {
    counts: backup.metadata.counts,
    safetySnapshot,
    validation,
  }
}

export const restoreDatabaseBackupSnapshot = async (id, { actor } = {}) => {
  const snapshot = await findBackupSnapshotById(id)
  if (!snapshot) return null
  return restoreDatabaseBackup(snapshot.payload, {
    actor,
    sourceSnapshotId: id,
  })
}

export const hasAutomaticBackupForDate = (dateKey) =>
  findBackupSnapshotForDate('automatic', dateKey)

export const pruneOldAutomaticBackups = async (retentionDays) => {
  const days = Math.max(1, Number(retentionDays) || 30)
  const beforeDate = new Date()
  beforeDate.setDate(beforeDate.getDate() - days)
  return pruneAutomaticBackupSnapshots(beforeDate)
}
