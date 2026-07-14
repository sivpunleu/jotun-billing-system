import { getAuthConfig } from '../config/auth.js'
import {
  createAdmin,
  findAdminById,
  findAdminByUsername,
  listAdmins,
  recordAdminLogin,
  updateAdmin,
  updateAdminPassword,
} from '../repositories/adminRepository.js'
import {
  listAuditLogs,
  writeAuditLog,
} from '../repositories/auditRepository.js'
import {
  hashPassword,
  verifyAdminCredentials,
  verifyPasswordHash,
} from '../services/authService.js'
import {
  createAdminSession,
  revokeAdminSession,
  rotateAdminRefreshToken,
} from '../services/sessionService.js'
import {
  clearLoginFailures,
  recordLoginFailure,
} from '../middleware/loginRateLimit.js'
import { validateStrongPassword } from '../utils/passwordPolicy.js'
import { requestSecurityMetadata } from '../utils/requestMetadata.js'

const VALID_ROLES = ['owner', 'admin', 'viewer']
const AVATAR_PATTERN = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/
const MAX_AVATAR_LENGTH = 350_000

const publicAdmin = (admin) => ({
  id: String(admin._id || admin.id || ''),
  username: admin.username,
  displayName: admin.displayName || '',
  avatar: admin.avatar || '',
  role: admin.role,
  active: admin.active,
  lastLoginAt: admin.lastLoginAt || null,
  createdAt: admin.createdAt || null,
})

const getStoredAdminWithPassword = async (username) =>
  findAdminByUsername(username, { includePassword: true })

const writeSecurityAudit = (payload) =>
  writeAuditLog(payload).catch((error) => {
    console.error(`Unable to write security audit log: ${error.message}`)
  })

const bootstrapAdmin = async (username, password, authConfig) => {
  if (!authConfig.hasBootstrapAdmin) return null
  const isValid = await verifyAdminCredentials(
    username,
    password,
    authConfig,
  )
  if (!isValid) return null

  try {
    return await createAdmin({
      username: authConfig.username,
      displayName: authConfig.username,
      passwordHash: authConfig.passwordHash,
      role: 'owner',
      active: true,
      createdBy: 'environment-bootstrap',
    })
  } catch (error) {
    if (error.code !== 11000) throw error
    return getStoredAdminWithPassword(authConfig.username)
  }
}

export const loginAdmin = async (req, res) => {
  try {
    const authConfig = getAuthConfig()
    if (!authConfig.hasJwtSecret) {
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

    let admin = await getStoredAdminWithPassword(username)
    const attemptedAdmin = admin
    let failureReason =
      admin?.active === false ? 'account_disabled' : 'invalid_credentials'
    if (admin) {
      const validPassword = await verifyPasswordHash(
        password,
        admin.passwordHash,
      )
      if (!validPassword) failureReason = 'invalid_credentials'
      if (!validPassword || !admin.active) admin = null
    } else {
      admin = await bootstrapAdmin(username, password, authConfig)
    }

    if (!admin || !admin.active) {
      await recordLoginFailure(req)
      await writeSecurityAudit({
        actor: {
          id: attemptedAdmin?._id || attemptedAdmin?.id || '',
          username: String(username || '').trim().toLowerCase() || 'unknown',
        },
        action: 'login_failed',
        entityType: 'admin',
        entityId: attemptedAdmin?._id || attemptedAdmin?.id || '',
        summary: String(username || '').trim().toLowerCase() || 'unknown',
        details: {
          reason: failureReason,
          ...requestSecurityMetadata(req),
        },
      })
      return res.status(401).json({
        message: 'Invalid username or password',
      })
    }

    await clearLoginFailures(req)
    await recordAdminLogin(admin._id || admin.id)
    const safeAdmin = publicAdmin(admin)
    const session = await createAdminSession({
      admin: {
        ...safeAdmin,
        tokenVersion: admin.tokenVersion,
      },
      authConfig,
      req,
    })
    await writeAuditLog({
      actor: safeAdmin,
      action: 'login',
      entityType: 'admin',
      entityId: safeAdmin.id,
      summary: safeAdmin.username,
      details: requestSecurityMetadata(req),
    })
    return res.json({
      ...session,
      admin: safeAdmin,
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ message: 'Unable to sign in' })
  }
}

export const refreshAdminSession = async (req, res) => {
  try {
    const authConfig = getAuthConfig()
    if (!authConfig.hasJwtSecret) {
      return res.status(503).json({
        message: 'Admin authentication is not configured on the server',
      })
    }

    const refreshToken = String(req.body?.refreshToken || '').trim()
    if (!refreshToken) {
      return res.status(400).json({ message: 'Refresh token is required' })
    }

    const session = await rotateAdminRefreshToken({
      authConfig,
      refreshToken,
      req,
    })
    const safeAdmin = publicAdmin(session.admin)
    await writeAuditLog({
      actor: safeAdmin,
      action: 'refresh_session',
      entityType: 'admin',
      entityId: safeAdmin.id,
      summary: safeAdmin.username,
      details: requestSecurityMetadata(req),
    })
    return res.json({
      token: session.token,
      expiresAt: session.expiresAt,
      refreshToken: session.refreshToken,
      refreshExpiresAt: session.refreshExpiresAt,
      admin: safeAdmin,
    })
  } catch (error) {
    return res.status(401).json({
      message: error.message || 'Unable to refresh session',
    })
  }
}

export const logoutAdmin = async (req, res) => {
  try {
    await revokeAdminSession({
      accessTokenPayload: req.authToken?.payload,
      adminId: req.admin.id,
      refreshToken: req.body?.refreshToken,
      reason: 'logout',
    })
    await writeAuditLog({
      actor: req.admin,
      action: 'logout',
      entityType: 'admin',
      entityId: req.admin.id,
      summary: req.admin.username,
      details: requestSecurityMetadata(req),
    })
    return res.json({ message: 'Signed out successfully' })
  } catch (error) {
    return res.status(400).json({ message: 'Unable to sign out securely' })
  }
}

export const getCurrentAdmin = (req, res) => {
  res.json({ admin: req.admin })
}

export const getProfile = async (req, res) => {
  try {
    const admin = req.admin.id
      ? await findAdminById(req.admin.id)
      : await findAdminByUsername(req.admin.username)
    if (!admin) return res.status(404).json({ message: 'Profile not found' })
    res.json({ admin: publicAdmin(admin) })
  } catch (error) {
    res.status(400).json({ message: error.message || 'Unable to load profile' })
  }
}

export const updateProfile = async (req, res) => {
  try {
    const admin = req.admin.id
      ? await findAdminById(req.admin.id)
      : await findAdminByUsername(req.admin.username)
    if (!admin) return res.status(404).json({ message: 'Profile not found' })

    const displayName = String(req.body.displayName || '').trim()
    const avatar = String(req.body.avatar || '').trim()
    if (displayName.length > 80) {
      throw new Error('Display name cannot exceed 80 characters')
    }
    if (
      avatar &&
      (!AVATAR_PATTERN.test(avatar) || avatar.length > MAX_AVATAR_LENGTH)
    ) {
      throw new Error('Profile image must be a small PNG, JPEG, or WebP image')
    }

    const updated = await updateAdmin(admin._id || admin.id, {
      displayName,
      avatar,
    })
    await writeAuditLog({
      actor: req.admin,
      action: 'update_profile',
      entityType: 'admin',
      entityId: req.admin.id,
      summary: req.admin.username,
      details: { avatarUpdated: avatar !== String(admin.avatar || '') },
    })
    res.json({ admin: publicAdmin(updated) })
  } catch (error) {
    res.status(400).json({
      message: error.message || 'Unable to update profile',
    })
  }
}

export const getProfileActivity = async (req, res) => {
  try {
    const result = await listAuditLogs({
      page: req.query.page,
      limit: req.query.limit,
      actorId: req.admin.id,
      actorUsername: req.admin.username,
    })
    res.json({
      items: result.items,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        pages: Math.max(1, Math.ceil(result.total / result.limit)),
      },
    })
  } catch (error) {
    res.status(400).json({
      message: error.message || 'Unable to load profile activity',
    })
  }
}

export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {}
    const admin = req.admin.id
      ? await findAdminById(req.admin.id)
      : await findAdminByUsername(req.admin.username)
    validateStrongPassword(newPassword, {
      username: admin?.username || req.admin.username,
      displayName: admin?.displayName || req.admin.displayName,
    })
    const adminWithPassword = await getStoredAdminWithPassword(
      admin?.username || req.admin.username,
    )
    if (
      !adminWithPassword ||
      !(await verifyPasswordHash(
        currentPassword,
        adminWithPassword.passwordHash,
      ))
    ) {
      await writeSecurityAudit({
        actor: req.admin,
        action: 'password_change_failed',
        entityType: 'admin',
        entityId: req.admin.id,
        summary: req.admin.username,
        details: {
          reason: 'incorrect_current_password',
          ...requestSecurityMetadata(req),
        },
      })
      return res.status(400).json({ message: 'Current password is incorrect' })
    }
    if (
      await verifyPasswordHash(
        newPassword,
        adminWithPassword.passwordHash,
      )
    ) {
      throw new Error('New password must be different from current password')
    }
    await updateAdminPassword(
      adminWithPassword._id || adminWithPassword.id,
      await hashPassword(newPassword),
    )
    await writeAuditLog({
      actor: req.admin,
      action: 'change_password',
      entityType: 'admin',
      entityId: req.admin.id,
      summary: req.admin.username,
      details: {
        sessionsInvalidated: true,
        ...requestSecurityMetadata(req),
      },
    })
    await writeAuditLog({
      actor: req.admin,
      action: 'sessions_invalidated',
      entityType: 'admin',
      entityId: req.admin.id,
      summary: req.admin.username,
      details: {
        reason: 'password_change',
        ...requestSecurityMetadata(req),
      },
    })
    res.json({ message: 'Password changed successfully' })
  } catch (error) {
    res.status(400).json({ message: error.message || 'Unable to change password' })
  }
}

export const getAdmins = async (_req, res) => {
  try {
    res.json(await listAdmins())
  } catch (error) {
    res.status(400).json({ message: error.message || 'Unable to load admins' })
  }
}

export const addAdmin = async (req, res) => {
  try {
    const username = String(req.body.username || '').trim().toLowerCase()
    const displayName = String(req.body.displayName || '').trim()
    const role = VALID_ROLES.includes(req.body.role) ? req.body.role : 'admin'
    if (!username) throw new Error('Username is required')
    validateStrongPassword(req.body.password, { username, displayName })

    const admin = await createAdmin({
      username,
      displayName,
      role,
      active: true,
      passwordHash: await hashPassword(req.body.password),
      createdBy: req.admin.username,
    })
    await writeAuditLog({
      actor: req.admin,
      action: 'create',
      entityType: 'admin',
      entityId: admin._id || admin.id,
      summary: username,
      details: { role },
    })
    res.status(201).json(admin)
  } catch (error) {
    const status = error.code === 11000 ? 409 : 400
    res.status(status).json({ message: error.message || 'Unable to create admin' })
  }
}

export const editAdmin = async (req, res) => {
  try {
    const existing = await findAdminById(req.params.id)
    if (!existing) return res.status(404).json({ message: 'Admin not found' })

    const payload = {}
    if (req.body.displayName !== undefined) {
      payload.displayName = String(req.body.displayName || '').trim()
    }
    if (req.body.role !== undefined) {
      if (!VALID_ROLES.includes(req.body.role)) {
        throw new Error('Invalid admin role')
      }
      payload.role = req.body.role
    }
    if (req.body.active !== undefined) {
      payload.active = Boolean(req.body.active)
    }
    if (req.body.password) {
      validateStrongPassword(req.body.password, {
        username: existing.username,
        displayName: existing.displayName,
      })
      payload.passwordHash = await hashPassword(req.body.password)
    }
    if (
      String(existing._id || existing.id) === String(req.admin.id) &&
      (payload.active === false || payload.role !== undefined)
    ) {
      throw new Error('You cannot disable or change your own role')
    }

    const invalidateSessions =
      Boolean(payload.passwordHash) ||
      (payload.role !== undefined && payload.role !== existing.role) ||
      (payload.active !== undefined && payload.active !== existing.active)
    const admin = await updateAdmin(req.params.id, payload, {
      invalidateSessions,
    })
    await writeAuditLog({
      actor: req.admin,
      action: 'update',
      entityType: 'admin',
      entityId: req.params.id,
      summary: existing.username,
      details: {
        role: payload.role,
        active: payload.active,
        passwordReset: Boolean(payload.passwordHash),
        sessionsInvalidated: invalidateSessions,
      },
    })
    const securityEvents = []
    if (payload.passwordHash) {
      securityEvents.push({
        action: 'password_reset',
        details: { sessionsInvalidated: true },
      })
    }
    if (payload.role !== undefined && payload.role !== existing.role) {
      securityEvents.push({
        action: 'role_change',
        details: {
          previousRole: existing.role,
          newRole: payload.role,
          sessionsInvalidated: true,
        },
      })
    }
    if (payload.active !== undefined && payload.active !== existing.active) {
      securityEvents.push({
        action: payload.active ? 'admin_enabled' : 'admin_disabled',
        details: { sessionsInvalidated: true },
      })
    }
    if (invalidateSessions) {
      securityEvents.push({
        action: 'sessions_invalidated',
        details: {
          reason: payload.passwordHash
            ? 'password_reset'
            : payload.role !== undefined
              ? 'role_change'
              : 'account_status_change',
        },
      })
    }
    await Promise.all(
      securityEvents.map((event) =>
        writeAuditLog({
          actor: req.admin,
          action: event.action,
          entityType: 'admin',
          entityId: req.params.id,
          summary: existing.username,
          details: {
            ...event.details,
            ...requestSecurityMetadata(req),
          },
        }),
      ),
    )
    res.json(admin)
  } catch (error) {
    res.status(400).json({ message: error.message || 'Unable to update admin' })
  }
}
