<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { reportApi } from '../api/invoices'
import TableSkeleton from '../components/TableSkeleton.vue'
import { formatDate, formatMoney, toDateInput } from '../utils/invoice'
import { showToast } from '../ui/feedback'

const report = ref(null)
const loading = ref(true)
const error = ref('')
const filters = reactive({
  from: toDateInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
  to: toDateInput(),
  groupBy: 'day',
})

const maxRevenue = computed(() =>
  Math.max(1, ...(report.value?.trend || []).map((item) => item.revenue)),
)

const loadReport = async () => {
  loading.value = true
  error.value = ''
  try {
    report.value = (await reportApi.revenue(filters)).data
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || 'Unable to load report'
    showToast(error.value, 'error')
  } finally {
    loading.value = false
  }
}

const applyPreset = (preset) => {
  const now = new Date()
  if (preset === 'today') {
    filters.from = toDateInput(now)
    filters.to = toDateInput(now)
    filters.groupBy = 'day'
  } else if (preset === 'month') {
    filters.from = toDateInput(
      new Date(now.getFullYear(), now.getMonth(), 1),
    )
    filters.to = toDateInput(now)
    filters.groupBy = 'day'
  } else {
    filters.from = toDateInput(new Date(now.getFullYear(), 0, 1))
    filters.to = toDateInput(now)
    filters.groupBy = 'month'
  }
  loadReport()
}

onMounted(loadReport)
</script>

<template>
  <section class="container page-section">
    <div class="page-heading">
      <div>
        <span class="eyebrow">REVENUE ANALYTICS</span>
        <h1>Reports</h1>
        <p>មើលចំណូល វិក្កយបត្រ និងបំណុលតាមថ្ងៃ ខែ ឬឆ្នាំ។</p>
      </div>
      <div class="d-flex flex-wrap gap-2">
        <button class="btn btn-outline-secondary" @click="applyPreset('today')">
          Today
        </button>
        <button class="btn btn-outline-secondary" @click="applyPreset('month')">
          This Month
        </button>
        <button class="btn btn-outline-secondary" @click="applyPreset('year')">
          This Year
        </button>
      </div>
    </div>

    <form
      class="content-card form-card report-filters mb-4"
      @submit.prevent="loadReport"
    >
      <div>
        <label class="form-label">From</label>
        <input v-model="filters.from" class="form-control" type="date" />
      </div>
      <div>
        <label class="form-label">To</label>
        <input v-model="filters.to" class="form-control" type="date" />
      </div>
      <div>
        <label class="form-label">Group By</label>
        <select v-model="filters.groupBy" class="form-select">
          <option value="day">Day</option>
          <option value="month">Month</option>
          <option value="year">Year</option>
        </select>
      </div>
      <button class="btn btn-danger" type="submit" :disabled="loading">
        <i class="bi bi-funnel me-1"></i> Apply Filter
      </button>
    </form>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>
    <div v-if="loading" class="dashboard-skeleton">
      <div v-for="index in 4" :key="index" class="skeleton-block"></div>
    </div>

    <template v-else-if="report">
      <div class="row g-3 mb-4">
        <div class="col-md-6 col-xl-3">
          <div class="summary-card">
            <div class="summary-icon bg-green-soft">
              <i class="bi bi-cash-stack"></i>
            </div>
            <div>
              <span>ចំណូលបានទទួល</span>
              <strong>{{ formatMoney(report.summary.revenue) }}</strong>
            </div>
          </div>
        </div>
        <div class="col-md-6 col-xl-3">
          <div class="summary-card">
            <div class="summary-icon bg-blue-soft">
              <i class="bi bi-receipt"></i>
            </div>
            <div>
              <span>ទឹកប្រាក់វិក្កយបត្រ</span>
              <strong>{{ formatMoney(report.summary.invoiced) }}</strong>
            </div>
          </div>
        </div>
        <div class="col-md-6 col-xl-3">
          <div class="summary-card">
            <div class="summary-icon bg-red-soft">
              <i class="bi bi-hourglass-split"></i>
            </div>
            <div>
              <span>បំណុលនៅសល់</span>
              <strong>{{ formatMoney(report.summary.outstanding) }}</strong>
            </div>
          </div>
        </div>
        <div class="col-md-6 col-xl-3">
          <div class="summary-card">
            <div class="summary-icon bg-yellow-soft">
              <i class="bi bi-files"></i>
            </div>
            <div>
              <span>វិក្កយបត្រសរុប</span>
              <strong>{{ report.summary.invoiceCount }}</strong>
            </div>
          </div>
        </div>
      </div>

      <div class="content-card form-card mb-4">
        <div class="report-chart-heading">
          <div>
            <h2 class="panel-title mb-1">Revenue Trend</h2>
            <small class="text-secondary">
              {{ formatDate(report.range.from) }} -
              {{ formatDate(report.range.to) }}
            </small>
          </div>
        </div>
        <div v-if="report.trend.length" class="revenue-chart">
          <div
            v-for="item in report.trend"
            :key="item.label"
            class="revenue-column"
          >
            <span>{{ formatMoney(item.revenue) }}</span>
            <div class="revenue-column-track">
              <i
                :style="{
                  height: `${Math.max(4, (item.revenue / maxRevenue) * 100)}%`,
                }"
              ></i>
            </div>
            <small>{{ item.label }}</small>
          </div>
        </div>
        <div v-else class="empty-state report-empty">
          <i class="bi bi-bar-chart"></i>
          <span>មិនមានចំណូលក្នុងរយៈពេលនេះ</span>
        </div>
      </div>

      <div class="content-card">
        <div class="card-toolbar">
          <h2 class="panel-title mb-0">Invoices in Period</h2>
          <span class="role-badge">{{ report.invoices.length }} records</span>
        </div>
        <TableSkeleton v-if="loading" />
        <div v-else class="table-responsive">
          <table class="table invoice-table responsive-table mb-0">
            <thead>
              <tr>
                <th>Invoice</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Status</th>
                <th class="text-end">Total</th>
                <th class="text-end">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="invoice in report.invoices" :key="invoice._id">
                <td class="mobile-card-primary" data-label="Invoice">
                  <RouterLink
                    class="invoice-number"
                    :to="`/invoices/${invoice._id}`"
                  >
                    {{ invoice.invoiceNumber }}
                  </RouterLink>
                </td>
                <td data-label="Customer">{{ invoice.customer?.name }}</td>
                <td data-label="Date">{{ formatDate(invoice.invoiceDate) }}</td>
                <td data-label="Status">{{ invoice.status }}</td>
                <td class="text-end fw-bold" data-label="Total">
                  {{ formatMoney(invoice.grandTotal) }}
                </td>
                <td class="text-end" data-label="Balance">
                  {{ formatMoney(invoice.balanceDue) }}
                </td>
              </tr>
              <tr v-if="!report.invoices.length">
                <td colspan="6" class="text-center text-secondary py-4">
                  No invoices in this period
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>
  </section>
</template>
