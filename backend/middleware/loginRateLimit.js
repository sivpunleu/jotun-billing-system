const attempts = new Map()
const WINDOW_MS = 15 * 60 * 1000
const ACCOUNT_MAX_ATTEMPTS = 8
const PAIR_MAX_ATTEMPTS = 8
const IP_MAX_ATTEMPTS = 24
const MAX_TRACKED_ATTEMPTS = 10_000

const getClientIp = (req) =>
  String(req.ip || req.socket?.remoteAddress || 'unknown')

const getUsername = (req) =>
  String(req.body?.username || '').trim().toLowerCase() || 'missing'

const getKeys = (req) => {
  const ip = getClientIp(req)
  const username = getUsername(req)
  return [
    { key: `account:${username}`, max: ACCOUNT_MAX_ATTEMPTS },
    { key: `pair:${username}:${ip}`, max: PAIR_MAX_ATTEMPTS },
    { key: `ip:${ip}`, max: IP_MAX_ATTEMPTS },
  ]
}

const pruneAttempts = (now) => {
  for (const [key, entry] of attempts) {
    if (now > entry.resetAt) attempts.delete(key)
  }

  while (attempts.size > MAX_TRACKED_ATTEMPTS) {
    attempts.delete(attempts.keys().next().value)
  }
}

const blockedAttempt = (req, now) =>
  getKeys(req)
    .map(({ key, max }) => ({ entry: attempts.get(key), max }))
    .filter(({ entry }) => entry && now <= entry.resetAt)
    .find(({ entry, max }) => entry.count >= max)

export const loginRateLimit = (req, res, next) => {
  const now = Date.now()
  pruneAttempts(now)
  const blocked = blockedAttempt(req, now)

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
}

export const recordLoginFailure = (req) => {
  const now = Date.now()
  pruneAttempts(now)

  for (const { key } of getKeys(req)) {
    const current = attempts.get(key)
    if (!current || now > current.resetAt) {
      attempts.set(key, { count: 1, resetAt: now + WINDOW_MS })
      continue
    }
    current.count += 1
    attempts.set(key, current)
  }
}

export const clearLoginFailures = (req) => {
  const keys = getKeys(req)
  attempts.delete(keys[0].key)
  attempts.delete(keys[1].key)
}

export const resetLoginRateLimitForTests = () => {
  attempts.clear()
}
