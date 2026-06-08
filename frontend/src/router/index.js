import { createRouter, createWebHistory } from 'vue-router'
import InvoiceForm from '../views/InvoiceForm.vue'
import InvoiceList from '../views/InvoiceList.vue'
import InvoicePreview from '../views/InvoicePreview.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/invoices',
    },
    {
      path: '/invoices',
      name: 'invoice-list',
      component: InvoiceList,
    },
    {
      path: '/invoices/new',
      name: 'invoice-create',
      component: InvoiceForm,
    },
    {
      path: '/invoices/:id/edit',
      name: 'invoice-edit',
      component: InvoiceForm,
    },
    {
      path: '/invoices/:id',
      name: 'invoice-preview',
      component: InvoicePreview,
    },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

export default router

