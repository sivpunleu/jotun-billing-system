import axios from 'axios'

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
