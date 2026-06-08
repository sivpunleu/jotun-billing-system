import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const TOKEN_ISSUER = 'jotun-billing-api'
const TOKEN_AUDIENCE = 'jotun-billing-admin'

export const verifyAdminCredentials = async (
  username,
  password,
  authConfig,
) => {
  const normalizedUsername = String(username || '').trim().toLowerCase()
  const configuredUsername = authConfig.username.toLowerCase()
  const passwordMatches = await bcrypt.compare(
    String(password || ''),
    authConfig.passwordHash,
  )

  return normalizedUsername === configuredUsername && passwordMatches
}

export const createAdminToken = (username, authConfig) =>
  jwt.sign(
    {
      username,
      role: 'admin',
    },
    authConfig.jwtSecret,
    {
      subject: 'admin',
      issuer: TOKEN_ISSUER,
      audience: TOKEN_AUDIENCE,
      expiresIn: authConfig.jwtExpiresIn,
    },
  )

export const verifyAdminToken = (token, authConfig) =>
  jwt.verify(token, authConfig.jwtSecret, {
    subject: 'admin',
    issuer: TOKEN_ISSUER,
    audience: TOKEN_AUDIENCE,
  })

export const decodeTokenExpiration = (token) => {
  const payload = jwt.decode(token)
  return payload?.exp ? new Date(payload.exp * 1000).toISOString() : null
}

