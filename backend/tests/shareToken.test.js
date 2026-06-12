import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createShareTokenExpiration,
  isShareTokenActive,
  normalizeShareLinkDays,
} from '../utils/shareToken.js'

test('share link duration is bounded to a safe range', () => {
  assert.equal(normalizeShareLinkDays('invalid'), 30)
  assert.equal(normalizeShareLinkDays(0), 1)
  assert.equal(normalizeShareLinkDays(500), 365)
})

test('share token activity requires a future expiration and no revocation', () => {
  const now = new Date('2026-06-13T00:00:00.000Z')
  const expiresAt = createShareTokenExpiration(now, 30)
  assert.equal(
    isShareTokenActive(
      {
        shareToken: 'token',
        shareTokenExpiresAt: expiresAt,
        shareTokenRevokedAt: null,
      },
      now,
    ),
    true,
  )
  assert.equal(
    isShareTokenActive(
      {
        shareToken: 'token',
        shareTokenExpiresAt: expiresAt,
        shareTokenRevokedAt: now,
      },
      now,
    ),
    false,
  )
  assert.equal(
    isShareTokenActive(
      {
        shareToken: 'token',
        shareTokenExpiresAt: '2026-06-12T00:00:00.000Z',
      },
      now,
    ),
    false,
  )
})
