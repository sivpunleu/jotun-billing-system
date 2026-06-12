import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

test('security updates increment the admin token version', async () => {
  const dataDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'jotun-billing-admin-'),
  )
  process.env.LOCAL_DATA_DIR = dataDirectory

  try {
    const repository = await import(
      `../repositories/adminRepository.js?security=${Date.now()}`
    )
    const admin = await repository.createAdmin({
      username: 'owner',
      displayName: 'Owner',
      passwordHash: 'old-password-hash',
      role: 'owner',
      active: true,
    })

    await repository.updateAdminPassword(
      admin._id,
      'new-password-hash',
    )
    let storedAdmin = await repository.findAdminById(admin._id)
    assert.equal(storedAdmin.tokenVersion, 1)

    await repository.updateAdmin(
      admin._id,
      { role: 'admin' },
      { invalidateSessions: true },
    )
    storedAdmin = await repository.findAdminById(admin._id)
    assert.equal(storedAdmin.tokenVersion, 2)

    await repository.updateAdmin(admin._id, { displayName: 'Updated Owner' })
    storedAdmin = await repository.findAdminById(admin._id)
    assert.equal(storedAdmin.tokenVersion, 2)
  } finally {
    delete process.env.LOCAL_DATA_DIR
    await rm(dataDirectory, { recursive: true, force: true })
  }
})
