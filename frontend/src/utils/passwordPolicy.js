export const PASSWORD_MINIMUM_LENGTH = 12

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

export const passwordPolicyMessage = (
  password,
  { username = '', displayName = '' } = {},
) => {
  const value = String(password || '')
  const normalized = value.toLowerCase()
  const identityParts = [username, displayName]
    .flatMap((item) => String(item || '').toLowerCase().split(/\s+/))
    .filter((item) => item.length >= 3)

  if (value.length < PASSWORD_MINIMUM_LENGTH) {
    return `Password ត្រូវមានយ៉ាងតិច ${PASSWORD_MINIMUM_LENGTH} តួអក្សរ។`
  }
  if (!/[a-z]/.test(value)) return 'Password ត្រូវមានអក្សរតូច។'
  if (!/[A-Z]/.test(value)) return 'Password ត្រូវមានអក្សរធំ។'
  if (!/\d/.test(value)) return 'Password ត្រូវមានលេខ។'
  if (!/[^A-Za-z0-9]/.test(value)) {
    return 'Password ត្រូវមានសញ្ញាពិសេស ដូចជា ! @ # $។'
  }
  if (COMMON_PASSWORDS.has(normalized)) return 'Password នេះងាយទាយពេក។'
  if (identityParts.some((part) => normalized.includes(part))) {
    return 'Password មិនត្រូវមាន Username ឬ Display Name ទេ។'
  }
  return ''
}
