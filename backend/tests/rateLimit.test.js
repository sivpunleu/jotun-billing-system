import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createApiRateLimit,
  resetApiRateLimitForTests,
} from '../middleware/apiRateLimit.js'
import {
  clearLoginFailures,
  loginRateLimit,
  recordLoginFailure,
  resetLoginRateLimitForTests,
} from '../middleware/loginRateLimit.js'

const createResponse = () => {
  const headers = {}
  return {
    headers,
    statusCode: 200,
    body: null,
    set(nameOrHeaders, value) {
      if (typeof nameOrHeaders === 'object') {
        Object.assign(headers, nameOrHeaders)
      } else {
        headers[nameOrHeaders] = value
      }
      return this
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}

test('API rate limiter blocks requests after the configured limit', () => {
  resetApiRateLimitForTests()
  let timestamp = 1_000
  const limiter = createApiRateLimit({
    windowMs: 60_000,
    maxRequests: 2,
    now: () => timestamp,
  })
  const req = { ip: '127.0.0.1' }
  let nextCalls = 0

  limiter(req, createResponse(), () => {
    nextCalls += 1
  })
  limiter(req, createResponse(), () => {
    nextCalls += 1
  })
  const blockedResponse = createResponse()
  limiter(req, blockedResponse, () => {
    nextCalls += 1
  })

  assert.equal(nextCalls, 2)
  assert.equal(blockedResponse.statusCode, 429)
  assert.equal(blockedResponse.headers['RateLimit-Remaining'], '0')
  assert.equal(blockedResponse.headers['Retry-After'], '60')

  timestamp += 60_001
  limiter(req, createResponse(), () => {
    nextCalls += 1
  })
  assert.equal(nextCalls, 3)
})

test('login limiter tracks failures by username as well as IP', () => {
  resetLoginRateLimitForTests()
  const failedRequest = {
    ip: '10.0.0.1',
    body: { username: 'Owner' },
  }
  for (let attempt = 0; attempt < 8; attempt += 1) {
    recordLoginFailure(failedRequest)
  }

  const sameAccountDifferentIp = {
    ip: '10.0.0.2',
    body: { username: 'owner' },
  }
  const blockedResponse = createResponse()
  let nextCalled = false
  loginRateLimit(sameAccountDifferentIp, blockedResponse, () => {
    nextCalled = true
  })

  assert.equal(nextCalled, false)
  assert.equal(blockedResponse.statusCode, 429)
  assert.ok(Number(blockedResponse.headers['Retry-After']) > 0)

  clearLoginFailures(failedRequest)
  const allowedResponse = createResponse()
  loginRateLimit(sameAccountDifferentIp, allowedResponse, () => {
    nextCalled = true
  })
  assert.equal(nextCalled, true)
})
