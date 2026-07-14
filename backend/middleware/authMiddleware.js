import { getAuthConfig } from '../config/auth.js'
import {
  findAdminById,
  findAdminByUsername,
} from '../repositories/adminRepository.js'
import {
  accessTokenRevoked,
  tokenVersionMatches,
  verifyAdminToken,
} from '../services/authService.js'

export const requireAdmin = async (req, res, next) => {
  const authConfig = getAuthConfig()
  if (!authConfig.hasJwtSecret) {
    return res.status(503).json({
      message: 'Admin authentication is not configured on the server',
    })
  }

  const authorization = String(req.headers.authorization || '')
  const [scheme, token] = authorization.split(' ')

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ message: 'Authentication is required' })
  }

  try {
    const payload = verifyAdminToken(token, authConfig)
    const storedAdmin = payload.adminId
      ? await findAdminById(payload.adminId, {
          includeRevokedAccessTokens: true,
        })
      : await findAdminByUsername(payload.username, {
          includeRevokedAccessTokens: true,
        })

    if (!storedAdmin) {
      return res.status(401).json({
        message: 'This admin account no longer exists',
      })
    }

    if (!storedAdmin.active) {
      return res.status(401).json({ message: 'This admin account is disabled' })
    }

    if (!tokenVersionMatches(payload, storedAdmin)) {
      return res.status(401).json({
        message: 'Your session is no longer valid. Please sign in again',
      })
    }

    if (accessTokenRevoked(payload, storedAdmin)) {
      return res.status(401).json({
        message: 'This session has been signed out',
      })
    }

    req.admin = {
      id: String(storedAdmin._id || payload.adminId || ''),
      username: storedAdmin.username || payload.username,
      displayName: storedAdmin.displayName || payload.displayName || '',
      role: storedAdmin.role || payload.role || 'viewer',
    }
    req.authToken = {
      expiresAt: payload.exp ? new Date(payload.exp * 1000) : null,
      payload,
      tokenId: payload.jti || '',
    }
    return next()
  } catch (error) {
    const message =
      error.name === 'TokenExpiredError'
        ? 'Your session has expired'
        : 'Invalid authentication token'
    return res.status(401).json({ message })
  }
}

export const authorizeRoles =
  (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.admin?.role)) {
      return res.status(403).json({
        message: 'You do not have permission to perform this action',
      })
    }
    return next()
  }
