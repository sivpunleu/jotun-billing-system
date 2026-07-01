import {
  createBackupSnapshot,
  hasAutomaticBackupForDate,
  pruneOldAutomaticBackups,
} from './backupService.js'

const ONE_HOUR = 60 * 60 * 1000

const parseBackupTime = () => {
  const [hour = '2', minute = '0'] = String(
    process.env.AUTO_BACKUP_TIME || '02:00',
  ).split(':')
  return {
    hour: Math.min(23, Math.max(0, Number(hour) || 2)),
    minute: Math.min(59, Math.max(0, Number(minute) || 0)),
  }
}

const formatBackupTime = ({ hour, minute }) =>
  `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`

const nextBackupRunAt = (now = new Date()) => {
  const { hour, minute } = parseBackupTime()
  const nextRun = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      hour,
      minute,
      0,
      0,
    ),
  )
  if (nextRun <= now) {
    nextRun.setUTCDate(nextRun.getUTCDate() + 1)
  }
  return nextRun
}

export const getAutomatedBackupStatus = (now = new Date()) => {
  const enabled = process.env.AUTO_BACKUP_ENABLED !== 'false'
  const backupTime = parseBackupTime()
  return {
    enabled,
    backupTimeUtc: formatBackupTime(backupTime),
    retentionDays: Number(process.env.AUTO_BACKUP_RETENTION_DAYS || 30),
    nextRunAt: enabled ? nextBackupRunAt(now).toISOString() : null,
  }
}

const isDueToday = (now = new Date()) => {
  const { hour, minute } = parseBackupTime()
  return (
    now.getUTCHours() > hour ||
    (now.getUTCHours() === hour && now.getUTCMinutes() >= minute)
  )
}

export const runAutomaticBackupIfDue = async () => {
  if (process.env.AUTO_BACKUP_ENABLED === 'false') return false
  const now = new Date()
  if (!isDueToday(now)) return false

  const dateKey = now.toISOString().slice(0, 10)
  const existing = await hasAutomaticBackupForDate(dateKey)
  if (existing) return false

  await createBackupSnapshot({
    type: 'automatic',
    createdBy: 'system',
    reason: `Daily automatic backup for ${dateKey}`,
  })
  await pruneOldAutomaticBackups(process.env.AUTO_BACKUP_RETENTION_DAYS || 30)
  return true
}

export const startAutomatedBackupScheduler = () => {
  if (process.env.AUTO_BACKUP_ENABLED === 'false') {
    console.log('Automated backups are disabled')
    return
  }

  const run = () => {
    runAutomaticBackupIfDue().catch((error) => {
      console.error(`Automated backup failed: ${error.message}`)
    })
  }

  setTimeout(run, 10_000)
  setInterval(run, ONE_HOUR)
}
