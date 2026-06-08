import { createRouter, createWebHistory } from 'vue-router'
import InvoiceForm from '../views/InvoiceForm.vue'
import InvoiceList from '../views/InvoiceList.vue'
import InvoicePreview from '../views/InvoicePreview.vue'
import LoginView from '../views/LoginView.vue'
import { hasValidSession } from '../auth/session'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: () => (hasValidSession() ? '/invoices' : '/login'),
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { guestOnly: true },
    },
    {
      path: '/invoices',
      name: 'invoice-list',
      component: InvoiceList,
      meta: { requiresAuth: true },
    },
    {
      path: '/invoices/new',
      name: 'invoice-create',
      component: InvoiceForm,
      meta: { requiresAuth: true },
    },
    {
      path: '/invoices/:id/edit',
      name: 'invoice-edit',
      component: InvoiceForm,
      meta: { requiresAuth: true },
    },
    {
      path: '/invoices/:id',
      name: 'invoice-preview',
      component: InvoicePreview,
    },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach((to) => {
  const authenticated = hasValidSession()

  if (to.meta.requiresAuth && !authenticated) {
    return {
      name: 'login',
      query: { redirect: to.fullPath },
    }
  }

  if (to.meta.guestOnly && authenticated) {
    return { name: 'invoice-list' }
  }

  return true
})

export default router
