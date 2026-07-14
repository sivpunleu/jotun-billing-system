import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test, { after } from 'node:test'

const authConfig = {
  jwtExpiresIn: '1h',
  jwtSecret: 'test-secret-that-is-long-enough-for-authentication',
}

const request = {
  headers: { 'user-agent': 'node-test' },
  ip: '127.0.0.1',
}

const dataDirectory = await mkdtemp(
  path.join(os.tmpdir(), 'jotun-billing-session-'),
)
process.env.LOCAL_DATA_DIR = dataDirectory

const repository = await import('../repositories/adminRepository.js')
const sessionService = await import('../services/sessionService.js')
const authService = await import('../services/authService.js')

after(async () => {
  delete process.env.LOCAL_DATA_DIR
  await rm(dataDirectory, { recursive: true, force: true })
})

let adminCounter = 0

const createTestAdmin = () => {
  adminCounter += 1
  return repository.createAdmin({
    username: `owner-${adminCounter}`,
    displayName: 'Owner',
    passwordHash: 'hash',
    role: 'owner',
    active: true,
  })
}

test('admin session creation stores only hashed refresh tokens', async () => {
  const admin = await createTestAdmin()

  const session = await sessionService.createAdminSession({
    admin,
    authConfig,
    req: request,
  })
  const storedAdmin = await repository.findAdminSessionState(admin._id)

  assert.ok(session.token)
  assert.ok(session.refreshToken)
  assert.equal(storedAdmin.refreshTokens.length, 1)
  assert.notEqual(storedAdmin.refreshTokens[0].tokenHash, session.refreshToken)
})

test('refresh token rotation revokes the previous token', async () => {
  const admin = await createTestAdmin()
  const firstSession = await sessionService.createAdminSession({
    admin,
    authConfig,
    req: request,
  })

  const rotatedSession = await sessionService.rotateAdminRefreshToken({
    authConfig,
    refreshToken: firstSession.refreshToken,
    req: request,
  })
  const storedAdmin = await repository.findAdminSessionState(admin._id)

  assert.ok(rotatedSession.token)
  assert.ok(rotatedSession.refreshToken)
  assert.notEqual(rotatedSession.refreshToken, firstSession.refreshToken)
  assert.equal(storedAdmin.refreshTokens.length, 2)
  assert.ok(storedAdmin.refreshTokens[0].revokedAt)
  await assert.rejects(
    () =>
      sessionService.rotateAdminRefreshToken({
        authConfig,
        refreshToken: firstSession.refreshToken,
        req: request,
      }),
    /no longer valid/i,
  )
})

test('logout revokes refresh and access tokens', async () => {
  const admin = await createTestAdmin()
  const session = await sessionService.createAdminSession({
    admin,
    authConfig,
    req: request,
  })
  const accessTokenPayload = authService.verifyAdminToken(
    session.token,
    authConfig,
  )

  await sessionService.revokeAdminSession({
    accessTokenPayload,
    adminId: admin._id,
    refreshToken: session.refreshToken,
    reason: 'logout',
  })
  const storedAdmin = await repository.findAdminSessionState(admin._id)
  const authAdmin = await repository.findAdminById(admin._id, {
    includeRevokedAccessTokens: true,
  })

  assert.ok(storedAdmin.refreshTokens[0].revokedAt)
  assert.equal(storedAdmin.revokedAccessTokens.length, 1)
  assert.equal(
    storedAdmin.revokedAccessTokens[0].tokenId,
      accessTokenPayload.jti,
  )
  assert.equal(
    authService.accessTokenRevoked(accessTokenPayload, authAdmin),
    true,
  )
})
