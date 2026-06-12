export const PASSWORD_MINIMUM_LENGTH = 12
export const PASSWORD_MAXIMUM_LENGTH = 128

const COMMON_PASSWORDS = new Set([
  'admin123',
  'admin1234',
  'password',
  'password1',
  'password123',
  'qwerty123',
  'rachana123',
  '1234567890',
])

export const passwordPolicyError = (
  password,
  { username = '', displayName = '' } = {},
) => {
  const value = String(password || '')
  const normalized = value.toLowerCase()
  const identityParts = [username, displayName]
    .flatMap((item) => String(item || '').toLowerCase().split(/\s+/))
    .filter((item) => item.length >= 3)

  if (value.length < PASSWORD_MINIMUM_LENGTH) {
    return `Password must contain at least ${PASSWORD_MINIMUM_LENGTH} characters`
  }
  if (value.length > PASSWORD_MAXIMUM_LENGTH) {
    return `Password cannot exceed ${PASSWORD_MAXIMUM_LENGTH} characters`
  }
  if (!/[a-z]/.test(value)) {
    return 'Password must contain a lowercase letter'
  }
  if (!/[A-Z]/.test(value)) {
    return 'Password must contain an uppercase letter'
  }
  if (!/\d/.test(value)) {
    return 'Password must contain a number'
  }
  if (!/[^A-Za-z0-9]/.test(value)) {
    return 'Password must contain a special character'
  }
  if (COMMON_PASSWORDS.has(normalized)) {
    return 'Password is too common'
  }
  if (identityParts.some((part) => normalized.includes(part))) {
    return 'Password cannot contain the username or display name'
  }
  return ''
}

export const validateStrongPassword = (password, identity = {}) => {
  const error = passwordPolicyError(password, identity)
  if (error) throw new Error(error)
}
