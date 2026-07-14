import {
  getRateLimitStore,
  resetRateLimitStoreForTests,
} from './rateLimitStore.js'

const WINDOW_MS = 15 * 60 * 1000
const ACCOUNT_MAX_ATTEMPTS = 8
const PAIR_MAX_ATTEMPTS = 8
const IP_MAX_ATTEMPTS = 24

const getClientIp = (req) =>
  String(req.ip || req.socket?.remoteAddress || 'unknown')

const getUsername = (req) =>
  String(req.body?.username || '').trim().toLowerCase() || 'missing'

const getKeys = (req) => {
  const ip = getClientIp(req)
  const username = getUsername(req)
  return [
    { key: `login:account:${username}`, max: ACCOUNT_MAX_ATTEMPTS },
    { key: `login:pair:${username}:${ip}`, max: PAIR_MAX_ATTEMPTS },
    { key: `login:ip:${ip}`, max: IP_MAX_ATTEMPTS },
  ]
}

const blockedAttempt = async (req, now) => {
  const keys = getKeys(req)
  const store = getRateLimitStore()
  const entries = await store.getMany(
    keys.map(({ key }) => key),
    { windowMs: WINDOW_MS, now },
  )

  return keys
    .map(({ max }, index) => ({ entry: entries[index], max }))
    .filter(({ entry }) => entry && now <= entry.resetAt)
    .find(({ entry, max }) => entry.count >= max)
}

export const loginRateLimit = (req, res, next) => {
  return Promise.resolve()
    .then(async () => {
      const now = Date.now()
      const blocked = await blockedAttempt(req, now)

      if (blocked) {
        const retryAfter = Math.max(
          1,
          Math.ceil((blocked.entry.resetAt - now) / 1000),
        )
        res.set('Retry-After', String(retryAfter))
        return res.status(429).json({
          message: 'Too many login attempts. Please try again later',
        })
      }

      return next()
    })
    .catch(next)
}

export const recordLoginFailure = async (req) => {
  const now = Date.now()
  const store = getRateLimitStore()

  await Promise.all(
    getKeys(req).map(({ key }) =>
      store.increment(key, { windowMs: WINDOW_MS, now }),
    ),
  )
}

export const clearLoginFailures = async (req) => {
  const store = getRateLimitStore()
  const keys = getKeys(req)
  await store.delete([keys[0].key, keys[1].key])
}

export const resetLoginRateLimitForTests = resetRateLimitStoreForTests
