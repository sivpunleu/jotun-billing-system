import { getAuthConfig } from '../config/auth.js'
import {
  createAdminToken,
  decodeTokenExpiration,
  verifyAdminCredentials,
} from '../services/authService.js'
import {
  clearLoginFailures,
  recordLoginFailure,
} from '../middleware/loginRateLimit.js'

export const loginAdmin = async (req, res) => {
  try {
    const authConfig = getAuthConfig()
    if (!authConfig.isConfigured) {
      return res.status(503).json({
        message: 'Admin authentication is not configured on the server',
      })
    }

    const { username, password } = req.body || {}
    if (!username || !password) {
      return res.status(400).json({
        message: 'Username and password are required',
      })
    }

    const isValid = await verifyAdminCredentials(
      username,
      password,
      authConfig,
    )
    if (!isValid) {
      recordLoginFailure(req)
      return res.status(401).json({
        message: 'Invalid username or password',
      })
    }

    clearLoginFailures(req)
    const token = createAdminToken(authConfig.username, authConfig)
    return res.json({
      token,
      expiresAt: decodeTokenExpiration(token),
      admin: {
        username: authConfig.username,
        role: 'admin',
      },
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ message: 'Unable to sign in' })
  }
}

export const getCurrentAdmin = (req, res) => {
  res.json({ admin: req.admin })
}
