import { createClient } from 'redis'

const DEFAULT_REDIS_PREFIX = 'jotun-billing:rate-limit'
const DEFAULT_MEMORY_MAX_KEYS = 20_000

const INCREMENT_WITH_TTL_SCRIPT = `
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
local ttl = redis.call("PTTL", KEYS[1])
if ttl < 0 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
  ttl = tonumber(ARGV[1])
end
return { current, ttl }
`

const redisUrl = () => String(process.env.REDIS_URL || '').trim()

const redisPrefix = () => {
  const prefix = String(process.env.RATE_LIMIT_REDIS_PREFIX || DEFAULT_REDIS_PREFIX)
    .trim()
    .replace(/:+$/u, '')
  return prefix || DEFAULT_REDIS_PREFIX
}

const rateLimitStoreMode = () =>
  String(process.env.RATE_LIMIT_STORE || '').trim().toLowerCase()

export const validateRateLimitConfig = () => {
  const mode = rateLimitStoreMode()
  if (mode && !['redis', 'memory'].includes(mode)) {
    throw new Error('RATE_LIMIT_STORE must be "redis" or "memory"')
  }
  if (process.env.NODE_ENV === 'production') {
    if (mode === 'memory') {
      throw new Error('RATE_LIMIT_STORE=memory is not allowed in production')
    }
    if (!redisUrl()) {
      throw new Error('REDIS_URL is required for production rate limiting')
    }
  }
  if (mode === 'redis' && !redisUrl()) {
    throw new Error('REDIS_URL is required when RATE_LIMIT_STORE=redis')
  }
}

const numericTtl = (ttl, windowMs) => {
  const parsed = Number(ttl)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : windowMs
}

class MemoryRateLimitStore {
  constructor({ maxKeys = DEFAULT_MEMORY_MAX_KEYS } = {}) {
    this.maxKeys = maxKeys
    this.entries = new Map()
  }

  prune(now) {
    for (const [key, entry] of this.entries) {
      if (now > entry.resetAt) this.entries.delete(key)
    }

    while (this.entries.size > this.maxKeys) {
      this.entries.delete(this.entries.keys().next().value)
    }
  }

  async increment(key, { windowMs, now = Date.now() }) {
    this.prune(now)
    const current = this.entries.get(key)
    const entry =
      !current || now > current.resetAt
        ? { count: 0, resetAt: now + windowMs }
        : current

    entry.count += 1
    this.entries.set(key, entry)
    return { ...entry }
  }

  async get(key, { now = Date.now() } = {}) {
    this.prune(now)
    const entry = this.entries.get(key)
    if (!entry || now > entry.resetAt) return null
    return { ...entry }
  }

  async getMany(keys, options = {}) {
    return Promise.all(keys.map((key) => this.get(key, options)))
  }

  async delete(keys) {
    for (const key of keys) {
      this.entries.delete(key)
    }
  }

  async reset() {
    this.entries.clear()
  }
}

class RedisRateLimitStore {
  constructor({ url, prefix }) {
    this.url = url
    this.prefix = prefix || DEFAULT_REDIS_PREFIX
    this.client = null
    this.connectPromise = null
  }

  key(key) {
    return `${this.prefix}:${key}`
  }

  async getClient() {
    if (this.client?.isOpen) return this.client

    if (!this.client) {
      this.client = createClient({
        url: this.url,
        socket: {
          reconnectStrategy: (retries) => Math.min(retries * 100, 3000),
        },
      })
      this.client.on('error', (error) => {
        console.error(`Redis rate limit store error: ${error.message}`)
      })
    }

    if (!this.connectPromise) {
      this.connectPromise = this.client.connect().catch((error) => {
        this.connectPromise = null
        throw error
      })
    }

    await this.connectPromise
    return this.client
  }

  async increment(key, { windowMs, now = Date.now() }) {
    const client = await this.getClient()
    const [count, ttl] = await client.eval(INCREMENT_WITH_TTL_SCRIPT, {
      keys: [this.key(key)],
      arguments: [String(windowMs)],
    })
    return {
      count: Number(count),
      resetAt: now + numericTtl(ttl, windowMs),
    }
  }

  async get(key, { windowMs, now = Date.now() } = {}) {
    const client = await this.getClient()
    const [count, ttl] = await Promise.all([
      client.get(this.key(key)),
      client.pTTL(this.key(key)),
    ])
    if (!count || Number(count) <= 0 || Number(ttl) <= 0) return null
    return {
      count: Number(count),
      resetAt: now + numericTtl(ttl, windowMs || Number(ttl)),
    }
  }

  async getMany(keys, options = {}) {
    return Promise.all(keys.map((key) => this.get(key, options)))
  }

  async delete(keys) {
    if (!keys.length) return
    const client = await this.getClient()
    await client.del(keys.map((key) => this.key(key)))
  }

  async reset() {
    const client = await this.getClient()
    let cursor = '0'
    do {
      const result = await client.scan(cursor, {
        MATCH: `${this.prefix}:*`,
        COUNT: 500,
      })
      cursor = result.cursor
      if (result.keys.length) await client.del(result.keys)
    } while (cursor !== '0')
  }
}

const createRateLimitStore = () => {
  validateRateLimitConfig()
  const mode = rateLimitStoreMode()
  const url = redisUrl()

  if (mode === 'memory') {
    return new MemoryRateLimitStore()
  }

  if (mode === 'redis' || url) {
    return new RedisRateLimitStore({
      url,
      prefix: redisPrefix(),
    })
  }

  return new MemoryRateLimitStore()
}

let store = null

export const getRateLimitStore = () => {
  if (!store) store = createRateLimitStore()
  return store
}

export const resetRateLimitStoreForTests = async () => {
  if (store) await store.reset()
  store = null
}
