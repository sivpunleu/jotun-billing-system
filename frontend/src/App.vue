<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  clearAuthSession,
  currentAdmin,
  isAuthenticated,
} from './auth/session'
import logo from './assets/logo-marvel.png'
import jotunLogo from './assets/jotun.jpg'

const router = useRouter()
const brandDestination = computed(() =>
  isAuthenticated.value ? '/invoices' : '/login',
)

const logout = async () => {
  clearAuthSession()
  await router.replace('/login')
}
</script>

<template>
  <div class="app-shell">
    <header class="app-header d-print-none">
      <nav class="navbar navbar-expand-lg">
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
            <div class="navbar-nav ms-auto align-items-lg-center gap-lg-2">
              <RouterLink v-if="isAuthenticated" class="nav-link" to="/invoices">
                <i class="bi bi-receipt me-1"></i>
                បញ្ជីវិក្កយបត្រ
              </RouterLink>
              <RouterLink
                v-if="isAuthenticated"
                class="btn btn-danger px-3"
                to="/invoices/new"
              >
                <i class="bi bi-plus-lg me-1"></i>
                បង្កើតវិក្កយបត្រ
              </RouterLink>
              <span v-if="isAuthenticated" class="admin-identity">
                <i class="bi bi-person-circle me-1"></i>
                {{ currentAdmin?.username }}
              </span>
              <button
                v-if="isAuthenticated"
                class="btn btn-outline-secondary"
                type="button"
                @click="logout"
              >
                <i class="bi bi-box-arrow-right me-1"></i>
                Logout
              </button>
              <RouterLink v-else class="btn btn-danger px-4" to="/login">
                <i class="bi bi-shield-lock me-1"></i>
                Admin Login
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
        <span>Built for clear, reliable invoicing</span>
      </div>
    </footer>
  </div>
</template>
