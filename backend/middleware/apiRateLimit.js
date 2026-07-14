import {
  getRateLimitStore,
  resetRateLimitStoreForTests,
} from './rateLimitStore.js'

const DEFAULT_WINDOW_MS = 15 * 60 * 1000
const DEFAULT_MAX_REQUESTS = 600

const clientIp = (req) =>
  String(req.ip || req.socket?.remoteAddress || 'unknown')

export const createApiRateLimit = ({
  windowMs = DEFAULT_WINDOW_MS,
  maxRequests = DEFAULT_MAX_REQUESTS,
  now = Date.now,
} = {}) => {
  return (req, res, next) => {
    return Promise.resolve()
      .then(async () => {
        const timestamp = now()
        const store = getRateLimitStore()
        const entry = await store.increment(`api:${clientIp(req)}`, {
          windowMs,
          now: timestamp,
        })

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
      })
      .catch(next)
  }
}

export const apiRateLimit = createApiRateLimit()

export const resetApiRateLimitForTests = resetRateLimitStoreForTests
