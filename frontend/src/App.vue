<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GlobalSearch from './components/GlobalSearch.vue'
import NotificationCenter from './components/NotificationCenter.vue'
import {
  canManageBilling,
  clearAuthSession,
  currentAdmin,
  isAuthenticated,
  isOwner,
} from './auth/session'
import {
  requestConfirmation,
  showSuccessAlert,
} from './ui/feedback'
import logo from './assets/logo-marvel.png'
import jotunLogo from './assets/jotun.jpg'

const route = useRoute()
const router = useRouter()
const sidebarOpen = ref(false)
const showWorkspace = computed(
  () => isAuthenticated.value && route.name !== 'login',
)
const pageMeta = computed(() => {
  const pages = {
    dashboard: ['ផ្ទាំងគ្រប់គ្រង', 'Business overview'],
    'invoice-list': ['វិក្កយបត្រ', 'Invoice management'],
    'invoice-create': ['បង្កើតវិក្កយបត្រ', 'New invoice'],
    'invoice-edit': ['កែប្រែវិក្កយបត្រ', 'Edit invoice'],
    'invoice-preview': ['មើលវិក្កយបត្រ', 'Invoice preview'],
    customers: ['អតិថិជន', 'Customer management'],
    products: ['ទំនិញ', 'Product catalogue'],
    salespeople: ['ក្រុមការងារ Sale', 'Sales team management'],
    'audit-logs': ['ប្រវត្តិសកម្មភាព', 'Audit log'],
    reports: ['Reports', 'Revenue and performance'],
    'customer-statement': ['Customer Statement', 'Billing history'],
    'payment-receipt': ['Payment Receipt', 'Printable receipt'],
    profile: ['Profile', 'My account'],
    settings: ['Admin Accounts', 'User management'],
    'system-settings': ['System Settings', 'Company and invoice setup'],
  }

  return pages[route.name] || ['Marvel Decor', 'Billing system']
})
const currentDate = computed(() =>
  new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date()),
)
const initials = computed(() => {
  const source =
    currentAdmin.value?.displayName || currentAdmin.value?.username || 'A'
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
})

watch(
  () => route.fullPath,
  () => {
    sidebarOpen.value = false
  },
)

const logout = async () => {
  const confirmed = await requestConfirmation({
    title: 'ចាកចេញពីប្រព័ន្ធ?',
    message: 'តើអ្នកប្រាកដថាចង់ចាកចេញពីគណនីនេះមែនទេ?',
    confirmLabel: 'ចាកចេញ',
    cancelLabel: 'នៅបន្ត',
    tone: 'danger',
  })
  if (!confirmed) return

  clearAuthSession()
  await router.replace('/login')
  await showSuccessAlert(
    'អ្នកបានចាកចេញពីប្រព័ន្ធដោយជោគជ័យ។',
    'ចាកចេញបានជោគជ័យ',
  )
}
</script>

<template>
  <div class="app-shell" :class="{ 'has-sidebar': showWorkspace }">
    <template v-if="showWorkspace">
      <aside
        class="app-sidebar d-print-none"
        :class="{ open: sidebarOpen }"
      >
        <div class="sidebar-brand">
          <RouterLink to="/dashboard">
            <img :src="logo" alt="Marvel Decor" />
            <span>
              <strong>MARVEL DECOR</strong>
              <small>JOTUN BILLING</small>
            </span>
          </RouterLink>
          <button
            class="sidebar-close"
            type="button"
            aria-label="Close menu"
            @click="sidebarOpen = false"
          >
            <i class="bi bi-x-lg"></i>
          </button>
        </div>

        <nav class="sidebar-nav">
          <span class="sidebar-label">OVERVIEW</span>
          <RouterLink to="/dashboard">
            <i class="bi bi-grid-1x2"></i>
            <span>ផ្ទាំងគ្រប់គ្រង</span>
          </RouterLink>
          <RouterLink to="/invoices">
            <i class="bi bi-receipt"></i>
            <span>វិក្កយបត្រ</span>
          </RouterLink>

          <span class="sidebar-label">BUSINESS</span>
          <RouterLink to="/customers">
            <i class="bi bi-people"></i>
            <span>អតិថិជន</span>
          </RouterLink>
          <RouterLink to="/products">
            <i class="bi bi-box-seam"></i>
            <span>ទំនិញ</span>
          </RouterLink>
          <RouterLink to="/salespeople">
            <i class="bi bi-person-badge"></i>
            <span>ក្រុមការងារ Sale</span>
          </RouterLink>
          <RouterLink to="/reports">
            <i class="bi bi-bar-chart-line"></i>
            <span>Reports</span>
          </RouterLink>

          <span
            v-if="canManageBilling"
            class="sidebar-label"
          >
            MANAGEMENT
          </span>
          <RouterLink v-if="canManageBilling" to="/audit-logs">
            <i class="bi bi-clock-history"></i>
            <span>ប្រវត្តិសកម្មភាព</span>
          </RouterLink>
          <RouterLink v-if="isOwner" to="/settings">
            <i class="bi bi-shield-lock"></i>
            <span>Admin Accounts</span>
          </RouterLink>
          <RouterLink v-if="isOwner" to="/system-settings">
            <i class="bi bi-sliders"></i>
            <span>System Settings</span>
          </RouterLink>
        </nav>

        <RouterLink
          v-if="canManageBilling"
          class="sidebar-create"
          to="/invoices/new"
        >
          <i class="bi bi-plus-lg"></i>
          បង្កើតវិក្កយបត្រ
        </RouterLink>

        <div class="sidebar-user">
          <RouterLink class="sidebar-profile" to="/profile">
            <img
              v-if="currentAdmin?.avatar"
              :src="currentAdmin.avatar"
              alt="Profile"
            />
            <span v-else class="sidebar-avatar">{{ initials }}</span>
            <span class="sidebar-user-copy">
              <strong>
                {{ currentAdmin?.displayName || currentAdmin?.username }}
              </strong>
              <small>{{ currentAdmin?.role }}</small>
            </span>
          </RouterLink>
          <button type="button" title="Logout" @click="logout">
            <i class="bi bi-box-arrow-right"></i>
          </button>
        </div>
      </aside>

      <button
        v-if="sidebarOpen"
        class="sidebar-overlay d-print-none"
        type="button"
        aria-label="Close menu"
        @click="sidebarOpen = false"
      ></button>

      <header class="mobile-app-header d-print-none">
        <button
          class="mobile-menu-button"
          type="button"
          aria-label="Open menu"
          @click="sidebarOpen = true"
        >
          <i class="bi bi-list"></i>
        </button>
        <RouterLink to="/dashboard">
          <img :src="logo" alt="Marvel Decor" />
          <strong>MARVEL DECOR</strong>
        </RouterLink>
        <RouterLink class="mobile-profile" to="/profile">
          <img
            v-if="currentAdmin?.avatar"
            :src="currentAdmin.avatar"
            alt="Profile"
          />
          <span v-else>{{ initials }}</span>
        </RouterLink>
      </header>

      <header class="desktop-app-header d-print-none">
        <div class="topbar-heading">
          <small>{{ pageMeta[1] }}</small>
          <h1>{{ pageMeta[0] }}</h1>
        </div>
        <GlobalSearch />
        <div class="topbar-actions">
          <div class="topbar-date">
            <i class="bi bi-calendar3"></i>
            <span>{{ currentDate }}</span>
          </div>
          <RouterLink
            v-if="canManageBilling && route.name !== 'invoice-create'"
            class="btn btn-danger topbar-create"
            to="/invoices/new"
          >
            <i class="bi bi-plus-lg"></i>
            <span>វិក្កយបត្រថ្មី</span>
          </RouterLink>
          <NotificationCenter />
          <RouterLink class="topbar-profile" to="/profile">
            <img
              v-if="currentAdmin?.avatar"
              :src="currentAdmin.avatar"
              alt="Profile"
            />
            <span v-else class="topbar-avatar">{{ initials }}</span>
            <span>
              <strong>
                {{ currentAdmin?.displayName || currentAdmin?.username }}
              </strong>
              <small>{{ currentAdmin?.role }}</small>
            </span>
            <i class="bi bi-chevron-down"></i>
          </RouterLink>
        </div>
      </header>
    </template>

    <header
      v-else-if="
        route.name !== 'invoice-preview' &&
        route.name !== 'login'
      "
      class="public-header d-print-none"
    >
      <RouterLink class="public-brand-lockup" to="/login">
        <span class="public-logo-frame public-logo-frame-marvel">
          <img :src="logo" alt="Marvel Decor" />
        </span>
        <span class="public-brand-divider" aria-hidden="true"></span>
        <span class="public-logo-frame public-logo-frame-jotun">
          <img :src="jotunLogo" alt="Jotun" />
        </span>
      </RouterLink>
    </header>

    <main class="app-content">
      <RouterView />
    </main>

    <footer
      v-if="
        !showWorkspace &&
        route.name !== 'invoice-preview' &&
        route.name !== 'login'
      "
      class="app-footer d-print-none"
    >
      <div class="container d-flex flex-wrap justify-content-between gap-2">
        <span>Marvel Decor Billing System</span>
        <span>Secure billing and customer management</span>
      </div>
    </footer>

  </div>
</template>
