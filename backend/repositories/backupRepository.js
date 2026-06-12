import { randomUUID } from 'node:crypto'
import { getStorageMode } from '../config/db.js'
import BackupSnapshot from '../models/BackupSnapshot.js'
import {
  mutateLocalCollection,
  readLocalCollection,
} from './localStore.js'

const withoutPayload = (snapshot) => {
  const plain =
    typeof snapshot?.toObject === 'function' ? snapshot.toObject() : snapshot
  if (!plain) return null
  const { payload: _payload, __v: _version, ...summary } = plain
  return summary
}

export const saveBackupSnapshot = async ({
  type = 'manual',
  label = '',
  createdBy = 'system',
  reason = '',
  counts = {},
  payload,
}) => {
  if (getStorageMode() === 'mongodb') {
    return BackupSnapshot.create({
      type,
      label,
      createdBy,
      reason,
      counts,
      payload,
    })
  }

  return mutateLocalCollection('backup-snapshots', (snapshots) => {
    const timestamp = new Date().toISOString()
    const snapshot = {
      _id: randomUUID(),
      type,
      label,
      createdBy,
      reason,
      counts,
      payload,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    snapshots.push(snapshot)
    return snapshot
  })
}

export const listBackupSnapshots = async ({ limit = 20 } = {}) => {
  const normalizedLimit = Math.min(100, Math.max(1, Number(limit) || 20))
  if (getStorageMode() === 'mongodb') {
    return BackupSnapshot.find({})
      .select('-payload')
      .sort({ createdAt: -1 })
      .limit(normalizedLimit)
      .lean()
  }

  return (await readLocalCollection('backup-snapshots'))
    .map(withoutPayload)
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
    .slice(0, normalizedLimit)
}

export const findBackupSnapshotById = async (id) => {
  if (getStorageMode() === 'mongodb') {
    return BackupSnapshot.findById(id).lean()
  }
  return (
    (await readLocalCollection('backup-snapshots')).find(
      (snapshot) => String(snapshot._id) === String(id),
    ) || null
  )
}

export const findBackupSnapshotForDate = async (type, dateKey) => {
  const start = new Date(`${dateKey}T00:00:00.000Z`)
  const end = new Date(`${dateKey}T23:59:59.999Z`)

  if (getStorageMode() === 'mongodb') {
    return BackupSnapshot.findOne({
      type,
      createdAt: { $gte: start, $lte: end },
    }).lean()
  }

  return (
    (await readLocalCollection('backup-snapshots')).find((snapshot) => {
      const createdAt = new Date(snapshot.createdAt)
      return snapshot.type === type && createdAt >= start && createdAt <= end
    }) || null
  )
}

export const pruneAutomaticBackupSnapshots = async (beforeDate) => {
  if (getStorageMode() === 'mongodb') {
    const result = await BackupSnapshot.deleteMany({
      type: 'automatic',
      createdAt: { $lt: beforeDate },
    })
    return result.deletedCount || 0
  }

  return mutateLocalCollection('backup-snapshots', (snapshots) => {
    const before = new Date(beforeDate)
    const keep = snapshots.filter(
      (snapshot) =>
        snapshot.type !== 'automatic' || new Date(snapshot.createdAt) >= before,
    )
    const removed = snapshots.length - keep.length
    snapshots.splice(0, snapshots.length, ...keep)
    return removed
  })
}
