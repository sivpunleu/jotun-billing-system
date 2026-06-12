import { randomBytes } from 'node:crypto'

const DEFAULT_SHARE_LINK_DAYS = 30
const MAX_SHARE_LINK_DAYS = 365

export const createShareToken = () => randomBytes(24).toString('base64url')

export const normalizeShareLinkDays = (
  value = process.env.PUBLIC_INVOICE_LINK_DAYS,
) => {
  const days = Number(value)
  if (!Number.isFinite(days)) return DEFAULT_SHARE_LINK_DAYS
  return Math.min(MAX_SHARE_LINK_DAYS, Math.max(1, Math.round(days)))
}

export const createShareTokenExpiration = (
  from = new Date(),
  days = normalizeShareLinkDays(),
) => {
  const expiresAt = new Date(from)
  expiresAt.setUTCDate(expiresAt.getUTCDate() + normalizeShareLinkDays(days))
  return expiresAt
}

export const isShareTokenActive = (invoice, now = new Date()) => {
  if (!String(invoice?.shareToken || '').trim()) return false
  if (invoice.shareTokenRevokedAt) return false
  const expiresAt = new Date(invoice.shareTokenExpiresAt)
  return Number.isFinite(expiresAt.getTime()) && expiresAt > new Date(now)
}
