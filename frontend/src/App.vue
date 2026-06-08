<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  canManageBilling,
  clearAuthSession,
  currentAdmin,
  isAuthenticated,
  isOwner,
} from './auth/session'
import logo from './assets/logo-marvel.png'
import jotunLogo from './assets/jotun.jpg'

const router = useRouter()
const brandDestination = computed(() =>
  isAuthenticated.value ? '/dashboard' : '/login',
)

const logout = async () => {
  clearAuthSession()
  await router.replace('/login')
}
</script>

<template>
  <div class="app-shell">
    <header class="app-header d-print-none">
      <nav class="navbar navbar-expand-xl">
        <div class="container">
          <RouterLink class="navbar-brand" :to="brandDestination">
            <span class="brand-logos">
              <img class="navbar-marvel-logo" :src="logo" alt="Marvel Paint Center" />
              <img class="navbar-jotun-logo" :src="jotunLogo" alt="Jotun" />
            </span>
          </RouterLink>

          <button
            class="navbar-toggler"
            type="button"
            data-bs-toggle="collapse"
            data-bs-target="#mainNavigation"
            aria-controls="mainNavigation"
            aria-expanded="false"
            aria-label="បើកម៉ឺនុយ"
          >
            <span class="navbar-toggler-icon"></span>
          </button>

          <div id="mainNavigation" class="collapse navbar-collapse">
            <div class="navbar-nav ms-auto align-items-xl-center gap-xl-1">
              <template v-if="isAuthenticated">
                <RouterLink class="nav-link" to="/dashboard">
                  <i class="bi bi-grid me-1"></i> Dashboard
                </RouterLink>
                <RouterLink class="nav-link" to="/invoices">
                  <i class="bi bi-receipt me-1"></i> វិក្កយបត្រ
                </RouterLink>
                <RouterLink class="nav-link" to="/customers">
                  <i class="bi bi-people me-1"></i> អតិថិជន
                </RouterLink>
                <RouterLink class="nav-link" to="/products">
                  <i class="bi bi-box-seam me-1"></i> ទំនិញ
                </RouterLink>
                <div class="nav-item dropdown">
                  <button
                    class="nav-link dropdown-toggle border-0 bg-transparent"
                    type="button"
                    data-bs-toggle="dropdown"
                  >
                    <i class="bi bi-gear me-1"></i> គ្រប់គ្រង
                  </button>
                  <ul class="dropdown-menu dropdown-menu-end">
                    <li>
                      <RouterLink class="dropdown-item" to="/profile">
                        <i class="bi bi-person-circle me-2"></i> Profile
                      </RouterLink>
                    </li>
                    <li v-if="canManageBilling">
                      <RouterLink class="dropdown-item" to="/audit-logs">
                        <i class="bi bi-clock-history me-2"></i> Audit Log
                      </RouterLink>
                    </li>
                    <li v-if="isOwner">
                      <RouterLink class="dropdown-item" to="/settings">
                        <i class="bi bi-shield-lock me-2"></i> Admin Accounts
                      </RouterLink>
                    </li>
                  </ul>
                </div>
                <RouterLink
                  v-if="canManageBilling"
                  class="btn btn-danger px-3"
                  to="/invoices/new"
                >
                  <i class="bi bi-plus-lg me-1"></i> វិក្កយបត្រថ្មី
                </RouterLink>
                <RouterLink class="admin-identity" to="/profile">
                  <img
                    v-if="currentAdmin?.avatar"
                    :src="currentAdmin.avatar"
                    alt="Profile"
                  />
                  <i v-else class="bi bi-person-circle"></i>
                  <span>
                    {{ currentAdmin?.displayName || currentAdmin?.username }}
                    <small>{{ currentAdmin?.role }}</small>
                  </span>
                </RouterLink>
                <button
                  class="btn btn-outline-secondary"
                  type="button"
                  @click="logout"
                >
                  <i class="bi bi-box-arrow-right"></i>
                </button>
              </template>
              <RouterLink v-else class="btn btn-danger px-4" to="/login">
                <i class="bi bi-shield-lock me-1"></i> Admin Login
              </RouterLink>
            </div>
          </div>
        </div>
      </nav>
    </header>

    <main class="app-content">
      <RouterView />
    </main>

    <footer class="app-footer d-print-none">
      <div class="container d-flex flex-wrap justify-content-between gap-2">
        <span>Marvel Paint Center Billing</span>
        <span>Secure billing, payments and customer management</span>
      </div>
    </footer>
  </div>
</template>
