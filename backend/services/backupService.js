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
import Salesperson from '../models/Salesperson.js'
import SystemSetting from '../models/SystemSetting.js'

export const BACKUP_FORMAT_VERSION = 2

const backupCollectionNames = [
  'invoices',
  'customers',
  'products',
  'salespeople',
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

const deriveCountersFromInvoices = (invoices = []) => {
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

export const buildDatabaseBackup = async ({
  createdBy = 'system',
  source = 'manual',
} = {}) => {
  const [
    invoices,
    customers,
    products,
    salespeople,
    admins,
    auditLogs,
    settings,
    counters,
  ] = await Promise.all([
    getAllInvoices(),
    getAllCatalogRecords('customers'),
    getAllCatalogRecords('products'),
    getAllCatalogRecords('salespeople'),
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
    invoices: normalizeArray(backup, 'invoices'),
    customers: normalizeArray(backup, 'customers'),
    products: normalizeArray(backup, 'products'),
    salespeople: normalizeArray(backup, 'salespeople'),
    auditLogs: Array.isArray(backup.auditLogs)
      ? backup.auditLogs.map(cleanPlainRecord)
      : [],
    admins: Array.isArray(backup.admins) ? backup.admins.map(cleanPlainRecord) : [],
    counters: Array.isArray(backup.counters)
      ? backup.counters.map(cleanPlainRecord)
      : deriveCountersFromInvoices(backup.invoices),
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
  { actor, sourceSnapshotId = '' } = {},
) => {
  const backup = normalizeBackupPayload(payload)
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
    },
  })

  return {
    counts: backup.metadata.counts,
    safetySnapshot,
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
