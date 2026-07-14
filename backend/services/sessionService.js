import {
  createAdminToken,
  createRefreshToken,
  createTokenId,
  decodeTokenExpiration,
  parseRefreshToken,
  refreshTokenExpiresAt,
} from './authService.js'
import { updateAdminSessionState } from '../repositories/adminRepository.js'
import { requestSecurityMetadata } from '../utils/requestMetadata.js'

const adminId = (admin) => String(admin?._id || admin?.id || '')

const dateValue = (value) => new Date(value).getTime()

const isFuture = (value, now) =>
  Number.isFinite(dateValue(value)) && dateValue(value) > dateValue(now)

const isActiveRefreshToken = (token, now = new Date()) =>
  Boolean(token && !token.revokedAt && isFuture(token.expiresAt, now))

const sessionTokens = (admin, sessionId) =>
  (admin.refreshTokens || []).filter(
    (token) => String(token.sessionId || '') === String(sessionId || ''),
  )

const findRefreshToken = (admin, parsed) =>
  sessionTokens(admin, parsed.sessionId).find(
    (token) => String(token.tokenHash || '') === parsed.tokenHash,
  )

const buildRefreshTokenRecord = ({
  accessTokenId,
  admin,
  expiresAt,
  refreshToken,
  req,
}) => {
  const metadata = requestSecurityMetadata(req)
  const now = new Date()
  return {
    tokenHash: refreshToken.tokenHash,
    sessionId: refreshToken.sessionId,
    accessTokenId,
    tokenVersion: Number(admin.tokenVersion || 0),
    expiresAt,
    createdAt: now,
    lastUsedAt: now,
    revokedAt: null,
    rotatedAt: null,
    replacedByHash: '',
    ipAddress: metadata.ipAddress,
    userAgent: metadata.userAgent,
  }
}

const markSessionRevoked = (admin, sessionId, now = new Date()) => {
  for (const token of sessionTokens(admin, sessionId)) {
    if (!token.revokedAt && isFuture(token.expiresAt, now)) {
      token.revokedAt = now
    }
  }
}

const addRevokedAccessToken = (
  admin,
  { expiresAt, reason = 'logout', tokenId },
  now = new Date(),
) => {
  if (!tokenId || !expiresAt || !isFuture(expiresAt, now)) return
  admin.revokedAccessTokens = admin.revokedAccessTokens || []
  if (
    admin.revokedAccessTokens.some(
      (entry) => String(entry.tokenId || '') === String(tokenId),
    )
  ) {
    return
  }
  admin.revokedAccessTokens.push({
    tokenId,
    expiresAt,
    revokedAt: now,
    reason,
  })
}

export const createAdminSession = async ({ admin, authConfig, req }) => {
  const id = adminId(admin)
  const accessTokenId = createTokenId()
  const token = createAdminToken(admin, authConfig, {
    tokenId: accessTokenId,
  })
  const refreshToken = createRefreshToken({ adminId: id })
  const refreshExpiresAt = refreshTokenExpiresAt()
  const refreshTokenRecord = buildRefreshTokenRecord({
    accessTokenId,
    admin,
    expiresAt: refreshExpiresAt,
    refreshToken,
    req,
  })

  await updateAdminSessionState(id, (storedAdmin) => {
    storedAdmin.refreshTokens = storedAdmin.refreshTokens || []
    storedAdmin.refreshTokens.push(refreshTokenRecord)
  })

  return {
    expiresAt: decodeTokenExpiration(token),
    refreshExpiresAt: refreshExpiresAt.toISOString(),
    refreshToken: refreshToken.token,
    token,
  }
}

export const rotateAdminRefreshToken = async ({
  authConfig,
  refreshToken,
  req,
}) => {
  const parsed = parseRefreshToken(refreshToken)
  if (!parsed) {
    throw new Error('Invalid refresh token')
  }

  const now = new Date()
  let rotatedSession = null
  await updateAdminSessionState(parsed.adminId, (storedAdmin) => {
    if (!storedAdmin?.active) {
      throw new Error('This admin account is disabled')
    }

    const current = findRefreshToken(storedAdmin, parsed)
    if (!current) {
      throw new Error('Invalid refresh token')
    }

    if (!isActiveRefreshToken(current, now)) {
      markSessionRevoked(storedAdmin, parsed.sessionId, now)
      throw new Error('Refresh token is no longer valid')
    }

    if (
      Number(current.tokenVersion || 0) !==
      Number(storedAdmin.tokenVersion || 0)
    ) {
      markSessionRevoked(storedAdmin, parsed.sessionId, now)
      throw new Error('Session is no longer valid')
    }

    const accessTokenId = createTokenId()
    const token = createAdminToken(storedAdmin, authConfig, {
      tokenId: accessTokenId,
    })
    const nextRefreshToken = createRefreshToken({
      adminId: parsed.adminId,
      sessionId: parsed.sessionId,
    })
    const refreshExpiresAt = refreshTokenExpiresAt(now)

    current.lastUsedAt = now
    current.revokedAt = now
    current.rotatedAt = now
    current.replacedByHash = nextRefreshToken.tokenHash

    storedAdmin.refreshTokens.push(
      buildRefreshTokenRecord({
        accessTokenId,
        admin: storedAdmin,
        expiresAt: refreshExpiresAt,
        refreshToken: nextRefreshToken,
        req,
      }),
    )

    rotatedSession = {
      admin: storedAdmin,
      expiresAt: decodeTokenExpiration(token),
      refreshExpiresAt: refreshExpiresAt.toISOString(),
      refreshToken: nextRefreshToken.token,
      token,
    }
  })

  if (!rotatedSession) {
    throw new Error('Unable to refresh session')
  }
  return rotatedSession
}

export const revokeAdminSession = async ({
  accessTokenPayload,
  adminId: requestedAdminId,
  reason = 'logout',
  refreshToken,
}) => {
  const parsed = parseRefreshToken(refreshToken)
  const id = String(requestedAdminId || parsed?.adminId || '')
  if (!id) return

  const accessTokenExpiresAt = accessTokenPayload?.exp
    ? new Date(accessTokenPayload.exp * 1000)
    : null
  const accessTokenId = String(accessTokenPayload?.jti || '')
  const now = new Date()

  await updateAdminSessionState(id, (storedAdmin) => {
    if (parsed && String(parsed.adminId) === id) {
      markSessionRevoked(storedAdmin, parsed.sessionId, now)
    }

    addRevokedAccessToken(
      storedAdmin,
      {
        expiresAt: accessTokenExpiresAt,
        reason,
        tokenId: accessTokenId,
      },
      now,
    )
  })
}
