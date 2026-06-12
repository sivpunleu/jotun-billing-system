const DEFAULT_WINDOW_MS = 15 * 60 * 1000
const DEFAULT_MAX_REQUESTS = 600
const MAX_TRACKED_CLIENTS = 10_000

const clients = new Map()

const clientIp = (req) =>
  String(req.ip || req.socket?.remoteAddress || 'unknown')

const pruneClients = (now) => {
  for (const [key, entry] of clients) {
    if (now > entry.resetAt) clients.delete(key)
  }

  while (clients.size > MAX_TRACKED_CLIENTS) {
    clients.delete(clients.keys().next().value)
  }
}

export const createApiRateLimit = ({
  windowMs = DEFAULT_WINDOW_MS,
  maxRequests = DEFAULT_MAX_REQUESTS,
  now = Date.now,
} = {}) => {
  return (req, res, next) => {
    const timestamp = now()
    pruneClients(timestamp)
    const key = clientIp(req)
    const current = clients.get(key)
    const entry =
      !current || timestamp > current.resetAt
        ? { count: 0, resetAt: timestamp + windowMs }
        : current

    entry.count += 1
    clients.set(key, entry)

    const remaining = Math.max(0, maxRequests - entry.count)
    const retryAfter = Math.max(
      1,
      Math.ceil((entry.resetAt - timestamp) / 1000),
    )
    res.set({
      'RateLimit-Limit': String(maxRequests),
      'RateLimit-Remaining': String(remaining),
      'RateLimit-Reset': String(retryAfter),
    })

    if (entry.count > maxRequests) {
      res.set('Retry-After', String(retryAfter))
      return res.status(429).json({
        message: 'Too many requests. Please try again later',
      })
    }

    return next()
  }
}

export const apiRateLimit = createApiRateLimit()

export const resetApiRateLimitForTests = () => {
  clients.clear()
}
