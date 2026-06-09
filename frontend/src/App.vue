<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  canManageBilling,
  clearAuthSession,
  currentAdmin,
  isAuthenticated,
  isOwner,
} from './auth/session'
import logo from './assets/logo-marvel.png'
import jotunLogo from './assets/jotun.jpg'

const route = useRoute()
const router = useRouter()
const sidebarOpen = ref(false)
const showWorkspace = computed(
  () => isAuthenticated.value && route.name !== 'login',
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
  clearAuthSession()
  await router.replace('/login')
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
    </template>

    <header
      v-else-if="route.name !== 'invoice-preview'"
      class="public-header d-print-none"
    >
      <RouterLink to="/login">
        <img :src="logo" alt="Marvel Decor" />
        <img class="public-jotun-logo" :src="jotunLogo" alt="Jotun" />
      </RouterLink>
    </header>

    <main class="app-content">
      <RouterView />
    </main>

    <footer
      v-if="!showWorkspace && route.name !== 'invoice-preview'"
      class="app-footer d-print-none"
    >
      <div class="container d-flex flex-wrap justify-content-between gap-2">
        <span>Marvel Decor Billing System</span>
        <span>Secure billing and customer management</span>
      </div>
    </footer>

  </div>
</template>
