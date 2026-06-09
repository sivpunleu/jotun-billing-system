<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { reportApi, salespersonApi } from '../api/invoices'
import ContentSkeleton from '../components/ContentSkeleton.vue'
import TableSkeleton from '../components/TableSkeleton.vue'
import {
  formatDate,
  formatMoney,
  invoiceStatusLabels,
  resolveInvoiceStatus,
  toDateInput,
} from '../utils/invoice'
import { showToast, validateForm } from '../ui/feedback'

const report = ref(null)
const loading = ref(true)
const error = ref('')
const salespeople = ref([])
const filters = reactive({
  from: toDateInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
  to: toDateInput(),
  groupBy: 'day',
  salesChannel: '',
  salespersonId: '',
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

const submitReport = async (event) => {
  const customMessage =
    filters.from &&
    filters.to &&
    new Date(filters.from) > new Date(filters.to)
      ? 'កាលបរិច្ឆេទ From មិនអាចក្រោយកាលបរិច្ឆេទ To បានទេ។'
      : ''
  if (
    !(await validateForm(event?.currentTarget, {
      customMessage,
    }))
  ) return
  await loadReport()
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

const changeSalesChannel = () => {
  if (filters.salesChannel !== 'salesperson') filters.salespersonId = ''
}

const initialize = async () => {
  try {
    const { data } = await salespersonApi.list({ limit: 100 })
    salespeople.value = data.items || []
  } catch {
    salespeople.value = []
  }
  await loadReport()
}

onMounted(initialize)
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
      novalidate
      @submit.prevent="submitReport"
    >
      <div>
        <label class="form-label">From *</label>
        <input v-model="filters.from" class="form-control" type="date" required />
      </div>
      <div>
        <label class="form-label">To *</label>
        <input v-model="filters.to" class="form-control" type="date" required />
      </div>
      <div>
        <label class="form-label">Group By</label>
        <select v-model="filters.groupBy" class="form-select">
          <option value="day">Day</option>
          <option value="month">Month</option>
          <option value="year">Year</option>
        </select>
      </div>
      <div>
        <label class="form-label">Sales Source</label>
        <select
          v-model="filters.salesChannel"
          class="form-select"
          @change="changeSalesChannel"
        >
          <option value="">All Sources</option>
          <option value="store">ទិញនៅហាងផ្ទាល់</option>
          <option value="salesperson">Sale ជាអ្នកលក់</option>
        </select>
      </div>
      <div>
        <label class="form-label">Salesperson</label>
        <select
          v-model="filters.salespersonId"
          class="form-select"
          :disabled="filters.salesChannel !== 'salesperson'"
        >
          <option value="">All Salespeople</option>
          <option
            v-for="salesperson in salespeople"
            :key="salesperson._id"
            :value="salesperson._id"
          >
            {{ salesperson.name }}
          </option>
        </select>
      </div>
      <button class="btn btn-danger" type="submit" :disabled="loading">
        <i class="bi bi-funnel me-1"></i> Apply Filter
      </button>
    </form>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>
    <ContentSkeleton v-if="loading" :cards="4" />

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

      <div class="content-card mb-4">
        <div class="card-toolbar">
          <div>
            <h2 class="panel-title mb-1">Sales Performance</h2>
            <small class="text-secondary">
              ប្រៀបធៀបការលក់នៅហាង និង Sale នីមួយៗ
            </small>
          </div>
          <span class="role-badge">
            {{ report.salesPerformance?.length || 0 }} sources
          </span>
        </div>
        <div class="table-responsive">
          <table class="table invoice-table responsive-table mb-0">
            <thead>
              <tr>
                <th>Sales Source</th>
                <th class="text-end">Invoices</th>
                <th class="text-end">Invoiced</th>
                <th class="text-end">Paid</th>
                <th class="text-end">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in report.salesPerformance || []"
                :key="item.key"
              >
                <td class="mobile-card-primary" data-label="Sales Source">
                  <span
                    class="sales-source-badge"
                    :class="
                      item.salesChannel === 'salesperson'
                        ? 'sales-source-person'
                        : 'sales-source-store'
                    "
                  >
                    <i
                      :class="
                        item.salesChannel === 'salesperson'
                          ? 'bi bi-person-badge'
                          : 'bi bi-shop'
                      "
                    ></i>
                    {{ item.label }}
                  </span>
                </td>
                <td class="text-end" data-label="Invoices">
                  {{ item.invoiceCount }}
                </td>
                <td class="text-end fw-bold" data-label="Invoiced">
                  {{ formatMoney(item.invoiced) }}
                </td>
                <td class="text-end" data-label="Paid">
                  {{ formatMoney(item.paid) }}
                </td>
                <td class="text-end" data-label="Outstanding">
                  {{ formatMoney(item.outstanding) }}
                </td>
              </tr>
              <tr v-if="!report.salesPerformance?.length">
                <td colspan="5" class="text-center text-secondary py-4">
                  No sales data in this period
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="content-card mb-4">
        <div class="card-toolbar">
          <div>
            <h2 class="panel-title mb-1">Products by Sales Source</h2>
            <small class="text-secondary">
              ទំនិញដែលលក់នៅហាង និងទំនិញដែល Sale នីមួយៗបានលក់
            </small>
          </div>
          <span class="role-badge">
            {{ report.salesItems?.length || 0 }} items
          </span>
        </div>
        <div class="table-responsive">
          <table class="table invoice-table responsive-table mb-0">
            <thead>
              <tr>
                <th>Sales Source</th>
                <th>Product</th>
                <th>Color Code</th>
                <th class="text-end">Quantity</th>
                <th class="text-end">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in report.salesItems || []" :key="item.key">
                <td class="mobile-card-primary" data-label="Sales Source">
                  {{ item.sourceLabel }}
                </td>
                <td data-label="Product">{{ item.productName }}</td>
                <td data-label="Color Code">{{ item.colorCode || '-' }}</td>
                <td class="text-end" data-label="Quantity">
                  {{ item.quantity }} {{ item.unit }}
                </td>
                <td class="text-end fw-bold" data-label="Amount">
                  {{ formatMoney(item.amount) }}
                </td>
              </tr>
              <tr v-if="!report.salesItems?.length">
                <td colspan="5" class="text-center text-secondary py-4">
                  No product sales in this period
                </td>
              </tr>
            </tbody>
          </table>
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
                <th>Sales Source</th>
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
                <td data-label="Sales Source">
                  {{
                    invoice.salesChannel === 'salesperson'
                      ? invoice.salesperson?.name || 'Sale'
                      : 'នៅហាង'
                  }}
                </td>
                <td data-label="Date">{{ formatDate(invoice.invoiceDate) }}</td>
                <td data-label="Status">
                  <span
                    class="status-pill"
                    :class="`status-${resolveInvoiceStatus(invoice)}`"
                  >
                    {{
                      invoiceStatusLabels[resolveInvoiceStatus(invoice)] ||
                      resolveInvoiceStatus(invoice)
                    }}
                  </span>
                </td>
                <td class="text-end fw-bold" data-label="Total">
                  {{ formatMoney(invoice.grandTotal) }}
                </td>
                <td class="text-end" data-label="Balance">
                  {{ formatMoney(invoice.balanceDue) }}
                </td>
              </tr>
              <tr v-if="!report.invoices.length">
                <td colspan="7" class="text-center text-secondary py-4">
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
