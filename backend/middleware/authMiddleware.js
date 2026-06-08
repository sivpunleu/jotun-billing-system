import { getAuthConfig } from '../config/auth.js'
import { verifyAdminToken } from '../services/authService.js'

export const requireAdmin = (req, res, next) => {
  const authConfig = getAuthConfig()
  if (!authConfig.isConfigured) {
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
    req.admin = {
      username: payload.username,
      role: payload.role,
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

