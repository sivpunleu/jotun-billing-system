<script setup>
import { onMounted, ref } from 'vue'
import { invoiceApi, reportApi } from '../api/invoices'
import { isOwner } from '../auth/session'
import { formatDate, formatMoney } from '../utils/invoice'

const metrics = ref(null)
const loading = ref(true)
const exporting = ref('')
const error = ref('')

const loadDashboard = async () => {
  loading.value = true
  error.value = ''
  try {
    metrics.value = (await invoiceApi.dashboard()).data
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || 'Unable to load dashboard'
  } finally {
    loading.value = false
  }
}

const download = async (type) => {
  exporting.value = type
  error.value = ''
  try {
    if (type === 'csv') await reportApi.exportCsv()
    else await reportApi.backup()
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || 'Unable to download report'
  } finally {
    exporting.value = ''
  }
}

onMounted(loadDashboard)
</script>

<template>
  <section class="container page-section">
    <div class="page-heading">
      <div>
        <span class="eyebrow">BUSINESS OVERVIEW</span>
        <h1>ផ្ទាំងគ្រប់គ្រង</h1>
        <p>តាមដានចំណូល បំណុល និងស្ថានភាពវិក្កយបត្រ។</p>
      </div>
      <div class="d-flex flex-wrap gap-2">
        <button
          class="btn btn-outline-success"
          type="button"
          :disabled="Boolean(exporting)"
          @click="download('csv')"
        >
          <i class="bi bi-file-earmark-spreadsheet me-1"></i>
          {{ exporting === 'csv' ? 'កំពុងទាញ...' : 'Export CSV' }}
        </button>
        <button
          v-if="isOwner"
          class="btn btn-outline-primary"
          type="button"
          :disabled="Boolean(exporting)"
          @click="download('backup')"
        >
          <i class="bi bi-database-down me-1"></i>
          {{ exporting === 'backup' ? 'កំពុងទាញ...' : 'Backup JSON' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>
    <div v-if="loading" class="loading-state content-card">
      <div class="spinner-border text-danger"></div>
      <span>កំពុងទាញទិន្នន័យ...</span>
    </div>

    <template v-else-if="metrics">
      <div class="row g-3 mb-4">
        <div class="col-md-6 col-xl-3">
          <div class="summary-card">
            <div class="summary-icon bg-blue-soft"><i class="bi bi-cash-stack"></i></div>
            <div><span>ចំណូលបានទទួល</span><strong>{{ formatMoney(metrics.revenue) }}</strong></div>
          </div>
        </div>
        <div class="col-md-6 col-xl-3">
          <div class="summary-card">
            <div class="summary-icon bg-red-soft"><i class="bi bi-hourglass-split"></i></div>
            <div><span>បំណុលនៅសល់</span><strong>{{ formatMoney(metrics.outstanding) }}</strong></div>
          </div>
        </div>
        <div class="col-md-6 col-xl-3">
          <div class="summary-card">
            <div class="summary-icon bg-green-soft"><i class="bi bi-check2-circle"></i></div>
            <div><span>វិក្កយបត្របង់រួច</span><strong>{{ metrics.paidInvoices }}</strong></div>
          </div>
        </div>
        <div class="col-md-6 col-xl-3">
          <div class="summary-card">
            <div class="summary-icon bg-yellow-soft"><i class="bi bi-receipt"></i></div>
            <div><span>វិក្កយបត្រសរុប</span><strong>{{ metrics.totalInvoices }}</strong></div>
          </div>
        </div>
      </div>

      <div class="row g-4">
        <div class="col-lg-5">
          <div class="content-card form-card h-100">
            <h2 class="panel-title">ស្ថានភាពវិក្កយបត្រ</h2>
            <div class="status-overview">
              <div><span>Draft</span><strong>{{ metrics.totalsByStatus.draft || 0 }}</strong></div>
              <div><span>Unpaid</span><strong>{{ metrics.totalsByStatus.unpaid || 0 }}</strong></div>
              <div><span>Partially Paid</span><strong>{{ metrics.totalsByStatus.partially_paid || 0 }}</strong></div>
              <div><span>Paid</span><strong>{{ metrics.totalsByStatus.paid || 0 }}</strong></div>
              <div><span>Cancelled</span><strong>{{ metrics.totalsByStatus.cancelled || 0 }}</strong></div>
            </div>
          </div>
        </div>
        <div class="col-lg-7">
          <div class="content-card">
            <div class="card-toolbar">
              <h2 class="panel-title mb-0">វិក្កយបត្រថ្មីៗ</h2>
              <RouterLink to="/invoices">មើលទាំងអស់</RouterLink>
            </div>
            <div class="table-responsive">
              <table class="table invoice-table mb-0">
                <thead><tr><th>លេខ</th><th>អតិថិជន</th><th>ថ្ងៃ</th><th class="text-end">នៅសល់</th></tr></thead>
                <tbody>
                  <tr v-for="invoice in metrics.recentInvoices" :key="invoice._id">
                    <td><RouterLink class="invoice-number" :to="`/invoices/${invoice._id}`">{{ invoice.invoiceNumber }}</RouterLink></td>
                    <td>{{ invoice.customer?.name }}</td>
                    <td>{{ formatDate(invoice.invoiceDate) }}</td>
                    <td class="text-end fw-bold">{{ formatMoney(invoice.balanceDue) }}</td>
                  </tr>
                  <tr v-if="!metrics.recentInvoices.length"><td colspan="4" class="text-center text-secondary py-4">មិនទាន់មានវិក្កយបត្រ</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>
