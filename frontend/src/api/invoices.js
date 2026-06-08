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

const createCatalogApi = (path) => ({
  list(params = {}) {
    return api.get(path, { params })
  },
  create(payload) {
    return api.post(path, payload)
  },
  update(id, payload) {
    return api.put(`${path}/${id}`, payload)
  },
  remove(id) {
    return api.delete(`${path}/${id}`)
  },
  restore(id) {
    return api.post(`${path}/${id}/restore`)
  },
})

export const authApi = {
  login(credentials) {
    return api.post('/auth/login', credentials)
  },
  me() {
    return api.get('/auth/me')
  },
  changePassword(payload) {
    return api.post('/auth/change-password', payload)
  },
  listAdmins() {
    return api.get('/auth/admins')
  },
  createAdmin(payload) {
    return api.post('/auth/admins', payload)
  },
  updateAdmin(id, payload) {
    return api.put(`/auth/admins/${id}`, payload)
  },
}

export const invoiceApi = {
  list(params = {}) {
    const normalizedParams =
      typeof params === 'string' ? { search: params } : params
    return api.get('/invoices', { params: normalizedParams })
  },
  dashboard() {
    return api.get('/invoices/dashboard')
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
  restore(id) {
    return api.post(`/invoices/${id}/restore`)
  },
  addPayment(id, payload) {
    return api.post(`/invoices/${id}/payments`, payload)
  },
}

export const customerApi = createCatalogApi('/customers')
export const productApi = createCatalogApi('/products')

export const auditApi = {
  list(params = {}) {
    return api.get('/audit-logs', { params })
  },
}

const downloadBlob = async (path, fallbackName) => {
  const response = await api.get(path, { responseType: 'blob' })
  const disposition = response.headers['content-disposition'] || ''
  const nameMatch = disposition.match(/filename="?([^"]+)"?/)
  const filename = nameMatch?.[1] || fallbackName
  const url = window.URL.createObjectURL(response.data)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

export const reportApi = {
  exportCsv() {
    return downloadBlob('/reports/invoices.csv', 'invoices.csv')
  },
  backup() {
    return downloadBlob('/reports/backup.json', 'jotun-billing-backup.json')
  },
}
