import axios from 'axios'
import {
  clearAuthSession,
  getAuthToken,
} from '../auth/session.js'

const productionApiUrl = 'https://jotun-billing-system.onrender.com/api'
const configuredApiUrl = import.meta.env.VITE_API_URL?.trim()
const baseURL = (
  import.meta.env.PROD ? productionApiUrl : configuredApiUrl || '/api'
).replace(/\/+$/, '')

const api = axios.create({
  baseURL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const token = getAuthToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestHadToken = Boolean(error.config?.headers?.Authorization)
    if (error.response?.status === 401 && requestHadToken) {
      clearAuthSession()
      window.dispatchEvent(new CustomEvent('auth:expired'))
    }
    return Promise.reject(error)
  },
)

export const authApi = {
  login(credentials) {
    return api.post('/auth/login', credentials)
  },
  me() {
    return api.get('/auth/me')
  },
}

export const invoiceApi = {
  list(search = '') {
    return api.get('/invoices', { params: { search } })
  },
  get(id) {
    return api.get(`/invoices/${id}`)
  },
  create(payload) {
    return api.post('/invoices', payload)
  },
  update(id, payload) {
    return api.put(`/invoices/${id}`, payload)
  },
  remove(id) {
    return api.delete(`/invoices/${id}`)
  },
}
