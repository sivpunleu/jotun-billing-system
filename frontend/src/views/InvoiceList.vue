<script setup>
import { onMounted, ref } from 'vue'
import InvoiceTableRow from '../components/InvoiceTableRow.vue'
import { invoiceApi } from '../api/invoices'
import { formatMoney } from '../utils/invoice'

const invoices = ref([])
const loading = ref(true)
const error = ref('')
const search = ref('')

const loadInvoices = async () => {
  loading.value = true
  error.value = ''
  try {
    const response = await invoiceApi.list(search.value)
    if (!Array.isArray(response.data)) {
      throw new Error('The invoice API returned an invalid response')
    }
    invoices.value = response.data
  } catch (requestError) {
    invoices.value = []
    error.value =
      requestError.response?.data?.message || 'មិនអាចទាញយកបញ្ជីវិក្កយបត្របានទេ'
  } finally {
    loading.value = false
  }
}

let searchTimer
const handleSearch = () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(loadInvoices, 300)
}

const deleteInvoice = async (invoice) => {
  const confirmed = window.confirm(
    `តើអ្នកពិតជាចង់លុបវិក្កយបត្រ ${invoice.invoiceNumber} មែនទេ?`,
  )
  if (!confirmed) return

  try {
    await invoiceApi.remove(invoice._id)
    invoices.value = invoices.value.filter((item) => item._id !== invoice._id)
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || 'មិនអាចលុបវិក្កយបត្របានទេ'
  }
}

const totalRevenue = () =>
  (Array.isArray(invoices.value) ? invoices.value : []).reduce(
    (sum, invoice) => sum + Number(invoice.grandTotal || 0),
    0,
  )

onMounted(loadInvoices)
</script>

<template>
  <section class="container page-section">
    <div class="page-heading">
      <div>
        <span class="eyebrow">BILLING OVERVIEW</span>
        <h1>បញ្ជីវិក្កយបត្រ</h1>
        <p>គ្រប់គ្រង និងតាមដានវិក្កយបត្ររបស់អតិថិជន។</p>
      </div>
      <RouterLink class="btn btn-danger btn-lg" to="/invoices/new">
        <i class="bi bi-plus-lg me-2"></i>
        វិក្កយបត្រថ្មី
      </RouterLink>
    </div>

    <div class="row g-3 mb-4">
      <div class="col-md-6">
        <div class="summary-card">
          <div class="summary-icon bg-blue-soft">
            <i class="bi bi-files"></i>
          </div>
          <div>
            <span>វិក្កយបត្រសរុប</span>
            <strong>{{ invoices.length }}</strong>
          </div>
        </div>
      </div>
      <div class="col-md-6">
        <div class="summary-card">
          <div class="summary-icon bg-yellow-soft">
            <i class="bi bi-cash-stack"></i>
          </div>
          <div>
            <span>ទឹកប្រាក់សរុប</span>
            <strong>{{ formatMoney(totalRevenue()) }}</strong>
          </div>
        </div>
      </div>
    </div>

    <div class="content-card">
      <div class="card-toolbar">
        <div class="search-box">
          <i class="bi bi-search"></i>
          <input
            v-model="search"
            class="form-control"
            type="search"
            placeholder="ស្វែងរកលេខវិក្កយបត្រ ឈ្មោះ ឬទូរស័ព្ទ..."
            @input="handleSearch"
          />
        </div>
        <button class="btn btn-outline-secondary" type="button" @click="loadInvoices">
          <i class="bi bi-arrow-clockwise me-1"></i>
          ផ្ទុកឡើងវិញ
        </button>
      </div>

      <div v-if="error" class="alert alert-danger mx-3 mt-3">{{ error }}</div>

      <div v-if="loading" class="loading-state">
        <div class="spinner-border text-danger" role="status"></div>
        <span>កំពុងទាញទិន្នន័យ...</span>
      </div>

      <div v-else-if="!invoices.length" class="empty-state">
        <div class="empty-icon"><i class="bi bi-receipt-cutoff"></i></div>
        <h3>មិនទាន់មានវិក្កយបត្រ</h3>
        <p>ចាប់ផ្តើមដោយបង្កើតវិក្កយបត្រដំបូងរបស់អ្នក។</p>
        <RouterLink class="btn btn-danger" to="/invoices/new">
          បង្កើតវិក្កយបត្រ
        </RouterLink>
      </div>

      <div v-else class="table-responsive">
        <table class="table invoice-table align-middle mb-0">
          <thead>
            <tr>
              <th>លេខវិក្កយបត្រ</th>
              <th>អតិថិជន</th>
              <th>ថ្ងៃកំណត់</th>
              <th>ស្ថានភាព</th>
              <th class="text-end">ទឹកប្រាក់</th>
              <th class="text-end">សកម្មភាព</th>
            </tr>
          </thead>
          <tbody>
            <InvoiceTableRow
              v-for="invoice in invoices"
              :key="invoice._id"
              :invoice="invoice"
              @delete="deleteInvoice"
            />
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>
