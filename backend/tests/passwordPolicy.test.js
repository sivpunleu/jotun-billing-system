import assert from 'node:assert/strict'
import test from 'node:test'
import {
  passwordPolicyError,
  validateStrongPassword,
} from '../utils/passwordPolicy.js'

test('password policy accepts a strong password', () => {
  assert.equal(passwordPolicyError('Marvel#Billing2026'), '')
  assert.doesNotThrow(() =>
    validateStrongPassword('Secure#Invoice92'),
  )
})

test('password policy rejects weak and identity-based passwords', () => {
  assert.match(passwordPolicyError('short'), /at least 12/)
  assert.match(passwordPolicyError('lowercase123!'), /uppercase/)
  assert.match(passwordPolicyError('UPPERCASE123!'), /lowercase/)
  assert.match(passwordPolicyError('NoNumbersHere!'), /number/)
  assert.match(passwordPolicyError('NoSpecial123'), /special/)
  assert.match(
    passwordPolicyError('Rachana#Secure2026', { username: 'rachana' }),
    /username/,
  )
})
