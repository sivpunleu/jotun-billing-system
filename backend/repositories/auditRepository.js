import { randomUUID } from 'node:crypto'
import { getStorageMode } from '../config/db.js'
import AuditLog from '../models/AuditLog.js'
import {
  mutateLocalCollection,
  readLocalCollection,
} from './localStore.js'

export const writeAuditLog = async ({
  actor,
  action,
  entityType,
  entityId = '',
  summary = '',
  details = {},
}) => {
  const payload = {
    actorId: String(actor?.id || actor?._id || ''),
    actorUsername: String(actor?.username || 'system'),
    action,
    entityType,
    entityId: String(entityId || ''),
    summary,
    details,
  }

  if (getStorageMode() === 'mongodb') {
    return AuditLog.create(payload)
  }

  return mutateLocalCollection('audit-logs', (logs) => {
    const record = {
      ...payload,
      _id: randomUUID(),
      createdAt: new Date().toISOString(),
    }
    logs.push(record)
    return record
  })
}

export const listAuditLogs = async ({
  page = 1,
  limit = 20,
  action = '',
  entityType = '',
  actorId = '',
  actorUsername = '',
} = {}) => {
  const normalizedPage = Math.max(1, Number(page) || 1)
  const normalizedLimit = Math.min(100, Math.max(1, Number(limit) || 20))

  if (getStorageMode() === 'mongodb') {
    const filter = {}
    if (action) filter.action = action
    if (entityType) filter.entityType = entityType
    if (actorId) filter.actorId = String(actorId)
    else if (actorUsername) filter.actorUsername = actorUsername
    const [items, total] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((normalizedPage - 1) * normalizedLimit)
        .limit(normalizedLimit),
      AuditLog.countDocuments(filter),
    ])
    return {
      items,
      total,
      page: normalizedPage,
      limit: normalizedLimit,
    }
  }

  const logs = (await readLocalCollection('audit-logs'))
    .filter((item) => !action || item.action === action)
    .filter((item) => !entityType || item.entityType === entityType)
    .filter((item) => !actorId || String(item.actorId) === String(actorId))
    .filter(
      (item) =>
        actorId ||
        !actorUsername ||
        item.actorUsername === actorUsername,
    )
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
  const offset = (normalizedPage - 1) * normalizedLimit
  return {
    items: logs.slice(offset, offset + normalizedLimit),
    total: logs.length,
    page: normalizedPage,
    limit: normalizedLimit,
  }
}

export const getAllAuditLogs = async () => {
  if (getStorageMode() === 'mongodb') {
    return AuditLog.find({}).sort({ createdAt: -1 }).lean()
  }
  return readLocalCollection('audit-logs')
}
