import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 10000,
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

