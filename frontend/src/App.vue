<script setup>
import logo from './assets/logo-marvel.png'
import jotunLogo from './assets/jotun-logo.svg'
</script>

<template>
  <div class="app-shell">
    <header class="app-header d-print-none">
      <nav class="navbar navbar-expand-lg">
        <div class="container">
          <RouterLink class="navbar-brand" to="/invoices">
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
              <RouterLink class="nav-link" to="/invoices">
                <i class="bi bi-receipt me-1"></i>
                បញ្ជីវិក្កយបត្រ
              </RouterLink>
              <RouterLink class="btn btn-danger px-3" to="/invoices/new">
                <i class="bi bi-plus-lg me-1"></i>
                បង្កើតវិក្កយបត្រ
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
