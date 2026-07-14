import { computed, ref } from 'vue'

const TOKEN_KEY = 'jotun_admin_token'
const ADMIN_KEY = 'jotun_admin_profile'
const REFRESH_TOKEN_KEY = 'jotun_admin_refresh_token'
const REFRESH_EXPIRES_KEY = 'jotun_admin_refresh_expires_at'

const readStorage = (key) => {
  if (typeof window === 'undefined') return ''
  return window.sessionStorage.getItem(key) || ''
}

const decodeToken = (token) => {
  try {
    const payload = token.split('.')[1]
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const normalized = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      '=',
    )
    return JSON.parse(window.atob(normalized))
  } catch {
    return null
  }
}

const tokenIsValid = (token) => {
  if (!token) return false
  const payload = decodeToken(token)
  return Boolean(payload?.exp && payload.exp * 1000 > Date.now())
}

const refreshTokenIsValid = (expiresAt) =>
  Boolean(expiresAt && new Date(expiresAt).getTime() > Date.now())

const readAdmin = () => {
  try {
    return JSON.parse(readStorage(ADMIN_KEY)) || null
  } catch {
    return null
  }
}

const storedToken = readStorage(TOKEN_KEY)
const storedRefreshToken = readStorage(REFRESH_TOKEN_KEY)
const storedRefreshExpiresAt = readStorage(REFRESH_EXPIRES_KEY)
export const authToken = ref(tokenIsValid(storedToken) ? storedToken : '')
export const authRefreshToken = ref(
  refreshTokenIsValid(storedRefreshExpiresAt) ? storedRefreshToken : '',
)
export const refreshExpiresAt = ref(
  authRefreshToken.value ? storedRefreshExpiresAt : '',
)
export const currentAdmin = ref(
  authToken.value || authRefreshToken.value ? readAdmin() : null,
)
export const isAuthenticated = computed(() =>
  Boolean(authToken.value || authRefreshToken.value),
)
export const canManageBilling = computed(() =>
  ['owner', 'admin'].includes(currentAdmin.value?.role),
)
export const isOwner = computed(
  () => currentAdmin.value?.role === 'owner',
)

let expirationTimer

const scheduleExpiration = (token) => {
  clearTimeout(expirationTimer)
  const payload = decodeToken(token)
  const delay = payload?.exp ? payload.exp * 1000 - Date.now() : 0

  if (delay <= 0) {
    clearAccessToken()
    return
  }

  expirationTimer = window.setTimeout(() => {
    clearAccessToken()
    if (!getRefreshToken()) {
      clearAuthSession()
      window.dispatchEvent(new CustomEvent('auth:expired'))
    }
  }, Math.min(delay, 2_147_483_647))
}

export const getAuthToken = () => {
  if (!tokenIsValid(authToken.value)) {
    clearAccessToken()
    return ''
  }
  return authToken.value
}

export const getRefreshToken = () => {
  if (!refreshTokenIsValid(refreshExpiresAt.value)) {
    clearRefreshToken()
    return ''
  }
  return authRefreshToken.value
}

export const hasValidSession = () =>
  Boolean(getAuthToken() || getRefreshToken())

export const setAuthSession = ({
  admin,
  refreshExpiresAt: nextRefreshExpiresAt,
  refreshToken,
  token,
}) => {
  authToken.value = token
  currentAdmin.value = admin
  window.sessionStorage.setItem(TOKEN_KEY, token)
  window.sessionStorage.setItem(ADMIN_KEY, JSON.stringify(admin))
  if (refreshToken && nextRefreshExpiresAt) {
    authRefreshToken.value = refreshToken
    refreshExpiresAt.value = nextRefreshExpiresAt
    window.sessionStorage.setItem(REFRESH_TOKEN_KEY, refreshToken)
    window.sessionStorage.setItem(REFRESH_EXPIRES_KEY, nextRefreshExpiresAt)
  } else {
    clearRefreshToken()
  }
  scheduleExpiration(token)
}

export const updateCurrentAdmin = (admin) => {
  currentAdmin.value = {
    ...(currentAdmin.value || {}),
    ...admin,
  }
  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem(
      ADMIN_KEY,
      JSON.stringify(currentAdmin.value),
    )
  }
}

export const clearAuthSession = () => {
  clearTimeout(expirationTimer)
  authToken.value = ''
  authRefreshToken.value = ''
  refreshExpiresAt.value = ''
  currentAdmin.value = null
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(TOKEN_KEY)
    window.sessionStorage.removeItem(ADMIN_KEY)
    window.sessionStorage.removeItem(REFRESH_TOKEN_KEY)
    window.sessionStorage.removeItem(REFRESH_EXPIRES_KEY)
  }
}

export const clearAccessToken = () => {
  clearTimeout(expirationTimer)
  authToken.value = ''
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(TOKEN_KEY)
  }
}

export const clearRefreshToken = () => {
  authRefreshToken.value = ''
  refreshExpiresAt.value = ''
  if (typeof window !== 'undefined') {
    window.sessionStorage.removeItem(REFRESH_TOKEN_KEY)
    window.sessionStorage.removeItem(REFRESH_EXPIRES_KEY)
  }
}

if (authToken.value && typeof window !== 'undefined') {
  scheduleExpiration(authToken.value)
}
