import { createHash, randomBytes, randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const TOKEN_ISSUER = 'jotun-billing-api'
const TOKEN_AUDIENCE = 'jotun-billing-admin'
const DEFAULT_REFRESH_TOKEN_DAYS = 7
const REFRESH_TOKEN_BYTES = 48
const REFRESH_TOKEN_PARTS = 3

export const verifyPasswordHash = (password, passwordHash) =>
  bcrypt.compare(String(password || ''), String(passwordHash || ''))

export const hashPassword = (password) =>
  bcrypt.hash(String(password || ''), 12)

export const verifyAdminCredentials = async (
  username,
  password,
  authConfig,
) => {
  const normalizedUsername = String(username || '').trim().toLowerCase()
  const configuredUsername = authConfig.username.toLowerCase()
  const passwordMatches = await verifyPasswordHash(
    password,
    authConfig.passwordHash,
  )

  return normalizedUsername === configuredUsername && passwordMatches
}

export const createTokenId = () => randomUUID()

export const refreshTokenLifetimeMs = () => {
  const configuredDays = Number(process.env.REFRESH_TOKEN_EXPIRES_IN_DAYS)
  const days =
    Number.isFinite(configuredDays) && configuredDays > 0
      ? configuredDays
      : DEFAULT_REFRESH_TOKEN_DAYS
  return days * 24 * 60 * 60 * 1000
}

export const refreshTokenExpiresAt = (now = new Date()) =>
  new Date(new Date(now).getTime() + refreshTokenLifetimeMs())

export const hashRefreshToken = (token) =>
  createHash('sha256').update(String(token || '')).digest('hex')

export const createRefreshToken = ({ adminId, sessionId = randomUUID() }) => {
  const normalizedAdminId = String(adminId || '').trim()
  if (!normalizedAdminId) {
    throw new Error('Admin id is required to create a refresh token')
  }
  const secret = randomBytes(REFRESH_TOKEN_BYTES).toString('base64url')
  const token = `${normalizedAdminId}.${sessionId}.${secret}`
  return {
    sessionId,
    token,
    tokenHash: hashRefreshToken(token),
  }
}

export const parseRefreshToken = (token) => {
  const value = String(token || '').trim()
  const parts = value.split('.')
  if (parts.length !== REFRESH_TOKEN_PARTS) return null
  const [adminId, sessionId, secret] = parts
  if (!adminId || !sessionId || !secret) return null
  return { adminId, sessionId, tokenHash: hashRefreshToken(value) }
}

export const createAdminToken = (
  adminOrUsername,
  authConfig,
  { tokenId = createTokenId() } = {},
) => {
  const admin =
    typeof adminOrUsername === 'string'
      ? {
          id: '',
          username: adminOrUsername,
          role: 'admin',
        }
      : adminOrUsername

  return jwt.sign(
    {
      adminId: String(admin.id || admin._id || ''),
      username: admin.username,
      displayName: admin.displayName || '',
      role: admin.role || 'admin',
      tokenVersion: Number(admin.tokenVersion || 0),
      type: 'access',
    },
    authConfig.jwtSecret,
    {
      subject: String(admin.id || admin._id || admin.username || 'admin'),
      jwtid: tokenId,
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
      expiresIn: authConfig.jwtExpiresIn,
    },
  )
}

export const verifyAdminToken = (token, authConfig) =>
  jwt.verify(token, authConfig.jwtSecret, {
    issuer: TOKEN_ISSUER,
    audience: TOKEN_AUDIENCE,
  })

export const tokenVersionMatches = (payload, admin) =>
  Number(payload?.tokenVersion || 0) === Number(admin?.tokenVersion || 0)

export const accessTokenRevoked = (payload, admin, now = new Date()) => {
  const tokenId = String(payload?.jti || '')
  if (!tokenId) return false
  const timestamp = new Date(now).getTime()
  return (admin?.revokedAccessTokens || []).some(
    (entry) =>
      String(entry.tokenId || '') === tokenId &&
      new Date(entry.expiresAt).getTime() > timestamp,
  )
}

export const decodeTokenExpiration = (token) => {
  const payload = jwt.decode(token)
  return payload?.exp ? new Date(payload.exp * 1000).toISOString() : null
}
