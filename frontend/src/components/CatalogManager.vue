<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { canManageBilling } from '../auth/session'
import PaginationControls from './PaginationControls.vue'
import TableSkeleton from './TableSkeleton.vue'
import { formatMoney } from '../utils/invoice'
import {
  requestConfirmation,
  requestStockMovement,
  showToast,
  validateForm,
} from '../ui/feedback'

const props = defineProps({
  kind: {
    type: String,
    required: true,
  },
  api: {
    type: Object,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
})

const route = useRoute()
const isProduct = computed(() => props.kind === 'product')
const isCustomer = computed(() => props.kind === 'customer')
const isSalesperson = computed(() => props.kind === 'salesperson')
const pageEyebrow = computed(() => {
  if (isProduct.value) return 'PRODUCT CATALOGUE'
  if (isSalesperson.value) return 'SALES TEAM'
  return 'CUSTOMER MANAGEMENT'
})
const pageDescription = computed(() => {
  if (isProduct.value) {
    return 'រក្សាទុកទំនិញ តម្លៃ ឯកតា និងលេខកូដ។'
  }
  if (isSalesperson.value) {
    return 'គ្រប់គ្រងឈ្មោះ Sale សម្រាប់កត់ត្រាប្រភពការលក់លើវិក្កយបត្រ។'
  }
  return 'រក្សាទុកព័ត៌មានអតិថិជនសម្រាប់ប្រើឡើងវិញ។'
})
const records = ref([])
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const search = ref('')
const showTrash = ref(false)
const editingId = ref('')
const formCard = ref(null)
const pagination = reactive({ page: 1, limit: 10, total: 0, pages: 1 })
const form = reactive({
  name: '',
  phone: '',
  address: '',
  notes: '',
  itemCode: '',
  colorCode: '',
  unit: 'ធុង',
  unitPrice: 0,
  stockQuantity: 0,
  lowStockThreshold: 5,
})

const resetForm = () => {
  editingId.value = ''
  Object.assign(form, {
    name: '',
    phone: '',
    address: '',
    notes: '',
    itemCode: '',
    colorCode: '',
    unit: 'ធុង',
    unitPrice: 0,
    stockQuantity: 0,
    lowStockThreshold: 5,
  })
}

const focusCreateForm = () => {
  resetForm()
  formCard.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  window.setTimeout(() => {
    formCard.value?.querySelector('input:not([disabled])')?.focus()
  }, 350)
}

const loadRecords = async (page = pagination.page) => {
  loading.value = true
  error.value = ''
  try {
    const { data } = await props.api.list({
      search: search.value,
      page,
      limit: pagination.limit,
      deleted: showTrash.value,
    })
    records.value = data.items || []
    Object.assign(pagination, data.pagination)
  } catch (requestError) {
    error.value = requestError.response?.data?.message || 'Unable to load records'
  } finally {
    loading.value = false
  }
}

let searchTimer
const handleSearch = () => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => loadRecords(1), 300)
}

const editRecord = (record) => {
  editingId.value = record._id
  Object.assign(form, {
    name: record.name || '',
    phone: record.phone || '',
    address: record.address || '',
    notes: record.notes || '',
    itemCode: record.itemCode || '',
    colorCode: record.colorCode || '',
    unit: record.unit || 'ធុង',
    unitPrice: record.unitPrice || 0,
    stockQuantity: record.stockQuantity || 0,
    lowStockThreshold: record.lowStockThreshold ?? 5,
  })
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const saveRecord = async (event) => {
  if (!(await validateForm(event?.currentTarget))) return

  saving.value = true
  error.value = ''
  try {
    const payload = JSON.parse(JSON.stringify(form))
    const wasEditing = Boolean(editingId.value)
    if (wasEditing) await props.api.update(editingId.value, payload)
    else await props.api.create(payload)
    showToast(
      wasEditing
        ? 'កែប្រែទិន្នន័យបានជោគជ័យ'
        : 'បន្ថែមទិន្នន័យបានជោគជ័យ',
    )
    resetForm()
    await loadRecords(1)
  } catch (requestError) {
    error.value = requestError.response?.data?.message || 'Unable to save record'
    showToast(error.value, 'error')
  } finally {
    saving.value = false
  }
}

const removeRecord = async (record) => {
  const confirmed = await requestConfirmation({
    title: 'ផ្លាស់ទីទៅធុងសំរាម?',
    message: `"${record.name}" អាចស្ដារឡើងវិញនៅពេលក្រោយ។`,
    confirmLabel: 'លុប',
    cancelLabel: 'បោះបង់',
    tone: 'danger',
  })
  if (!confirmed) return
  try {
    await props.api.remove(record._id)
    showToast('ផ្លាស់ទីទៅធុងសំរាមបានជោគជ័យ')
    await loadRecords(pagination.page)
  } catch (requestError) {
    error.value = requestError.response?.data?.message || 'Unable to delete record'
    showToast(error.value, 'error')
  }
}

const restoreRecord = async (record) => {
  try {
    await props.api.restore(record._id)
    showToast('ស្ដារទិន្នន័យបានជោគជ័យ')
    await loadRecords(pagination.page)
  } catch (requestError) {
    error.value = requestError.response?.data?.message || 'Unable to restore record'
    showToast(error.value, 'error')
  }
}

const toggleTrash = () => {
  showTrash.value = !showTrash.value
  resetForm()
  loadRecords(1)
}

const manageStock = async (record) => {
  const movement = await requestStockMovement(record)
  if (!movement) return
  error.value = ''
  try {
    await props.api.stock(record._id, movement)
    showToast('Stock updated successfully')
    await loadRecords(pagination.page)
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || 'Unable to update stock'
    showToast(error.value, 'error')
  }
}

watch(
  () => route.query.search,
  (value) => {
    if (!value) return
    search.value = String(value)
    loadRecords(1)
  },
)

onMounted(() => {
  if (route.query.search) search.value = String(route.query.search)
  loadRecords()
})
</script>

<template>
  <section class="container page-section">
    <div class="page-heading">
      <div>
        <span class="eyebrow">{{ pageEyebrow }}</span>
        <h1>{{ title }}</h1>
        <p>{{ pageDescription }}</p>
      </div>
      <button class="btn btn-outline-secondary" type="button" @click="toggleTrash">
        <i :class="showTrash ? 'bi bi-arrow-left' : 'bi bi-trash3'" class="me-1"></i>
        {{ showTrash ? 'ត្រឡប់ទៅបញ្ជី' : 'ធុងសំរាម' }}
      </button>
    </div>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>

    <div
      v-if="canManageBilling && !showTrash"
      ref="formCard"
      class="content-card form-card mb-4"
    >
      <div class="section-title">
        <span class="section-number">{{ editingId ? 'EDIT' : 'NEW' }}</span>
        <div>
          <h2>{{ editingId ? 'កែប្រែទិន្នន័យ' : `បន្ថែម${title}` }}</h2>
          <p>ព័ត៌មាននេះអាចជ្រើសបានក្នុងពេលបង្កើតវិក្កយបត្រ។</p>
        </div>
      </div>
      <form novalidate @submit.prevent="saveRecord">
        <div class="row g-3">
          <div class="col-md-4">
            <label class="form-label">ឈ្មោះ *</label>
            <input
              v-model.trim="form.name"
              class="form-control"
              minlength="2"
              maxlength="120"
              required
            />
          </div>
          <template v-if="isProduct">
            <div class="col-md-2">
              <label class="form-label">Item Code</label>
              <input v-model.trim="form.itemCode" class="form-control" />
            </div>
            <div class="col-md-2">
              <label class="form-label">Color Code</label>
              <input v-model.trim="form.colorCode" class="form-control" />
            </div>
            <div class="col-md-2">
              <label class="form-label">ឯកតា *</label>
              <input v-model.trim="form.unit" class="form-control" required />
            </div>
            <div class="col-md-2">
              <label class="form-label">តម្លៃ *</label>
              <input v-model.number="form.unitPrice" class="form-control" type="number" min="0" step="0.01" required />
            </div>
            <div class="col-md-3">
              <label class="form-label">Stock Quantity</label>
              <input
                v-model.number="form.stockQuantity"
                class="form-control"
                type="number"
                min="0"
                step="0.01"
                :disabled="Boolean(editingId)"
              />
              <small v-if="editingId" class="text-secondary">
                Use Stock button to record movements.
              </small>
            </div>
            <div class="col-md-3">
              <label class="form-label">Low Stock Alert</label>
              <input
                v-model.number="form.lowStockThreshold"
                class="form-control"
                type="number"
                min="0"
                step="0.01"
              />
            </div>
          </template>
          <template v-else>
            <div class="col-md-3">
              <label class="form-label">លេខទូរស័ព្ទ</label>
              <input
                v-model.trim="form.phone"
                class="form-control"
                type="tel"
                pattern="[0-9+() -]{7,20}"
                title="សូមបញ្ចូលលេខទូរស័ព្ទត្រឹមត្រូវ"
              />
            </div>
            <div v-if="isCustomer" class="col-md-5">
              <label class="form-label">អាសយដ្ឋាន</label>
              <input v-model.trim="form.address" class="form-control" />
            </div>
          </template>
          <div class="col-12">
            <label class="form-label">កំណត់ចំណាំ</label>
            <input v-model.trim="form.notes" class="form-control" />
          </div>
        </div>
        <div class="d-flex gap-2 mt-3">
          <button class="btn btn-danger" type="submit" :disabled="saving">
            {{ saving ? 'កំពុងរក្សាទុក...' : 'រក្សាទុក' }}
          </button>
          <button v-if="editingId" class="btn btn-light" type="button" @click="resetForm">បោះបង់</button>
        </div>
      </form>
    </div>

    <div class="content-card">
      <div class="card-toolbar">
        <div class="search-box">
          <i class="bi bi-search"></i>
          <input v-model="search" class="form-control" type="search" placeholder="ស្វែងរក..." @input="handleSearch" />
        </div>
        <button class="btn btn-outline-secondary" type="button" @click="loadRecords(pagination.page)">
          <i class="bi bi-arrow-clockwise"></i>
        </button>
      </div>
      <TableSkeleton v-if="loading" />
      <div v-else-if="!records.length" class="empty-state">
        <div class="empty-icon"><i class="bi bi-inbox"></i></div>
        <h3>មិនមានទិន្នន័យ</h3>
        <p>បង្កើតកំណត់ត្រាថ្មី ឬកែពាក្យស្វែងរករបស់អ្នក។</p>
        <button
          v-if="canManageBilling && !showTrash"
          class="btn btn-danger"
          type="button"
          @click="focusCreateForm"
        >
          <i class="bi bi-plus-lg me-1"></i> បង្កើតថ្មី
        </button>
      </div>
      <div v-else class="table-responsive">
        <table class="table invoice-table responsive-table mb-0">
          <thead>
            <tr>
              <th>ឈ្មោះ</th>
              <th v-if="isProduct">Code / Color</th>
              <th v-if="isProduct">ឯកតា</th>
              <th v-if="isProduct">Stock</th>
              <th v-if="isProduct" class="text-end">តម្លៃ</th>
              <th v-if="!isProduct">ទូរស័ព្ទ</th>
              <th v-if="isCustomer">អាសយដ្ឋាន</th>
              <th v-if="isSalesperson">កំណត់ចំណាំ</th>
              <th class="text-end">សកម្មភាព</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="record in records" :key="record._id">
              <td class="mobile-card-primary" data-label="ឈ្មោះ"><strong>{{ record.name }}</strong><small v-if="record.notes && !isSalesperson" class="d-block text-secondary">{{ record.notes }}</small></td>
              <td v-if="isProduct" data-label="Code / Color">{{ record.itemCode || '-' }}<small class="d-block text-secondary">{{ record.colorCode }}</small></td>
              <td v-if="isProduct" data-label="ឯកតា">{{ record.unit }}</td>
              <td v-if="isProduct" data-label="Stock">
                <span
                  class="stock-value"
                  :class="{
                    'stock-low':
                      Number(record.stockQuantity || 0) <=
                      Number(record.lowStockThreshold ?? 5),
                  }"
                >
                  {{ record.stockQuantity || 0 }} {{ record.unit }}
                </span>
                <small class="d-block text-secondary">
                  Alert at {{ record.lowStockThreshold ?? 5 }}
                </small>
              </td>
              <td v-if="isProduct" class="text-end fw-bold" data-label="តម្លៃ">{{ formatMoney(record.unitPrice) }}</td>
              <td v-if="!isProduct" data-label="ទូរស័ព្ទ">{{ record.phone || '-' }}</td>
              <td v-if="isCustomer" data-label="អាសយដ្ឋាន">{{ record.address || '-' }}</td>
              <td v-if="isSalesperson" data-label="កំណត់ចំណាំ">{{ record.notes || '-' }}</td>
              <td class="text-end text-nowrap mobile-card-actions" data-label="សកម្មភាព">
                <button v-if="showTrash && canManageBilling" class="btn btn-sm btn-outline-success" type="button" @click="restoreRecord(record)">
                  <i class="bi bi-arrow-counterclockwise me-1"></i> Restore
                </button>
                <template v-else>
                  <RouterLink
                    v-if="isCustomer"
                    class="btn btn-sm btn-outline-primary"
                    :to="`/customers/${record._id}/statement`"
                  >
                    <i class="bi bi-file-earmark-text me-1"></i> Statement
                  </RouterLink>
                  <template v-if="canManageBilling">
                    <button
                      v-if="isProduct"
                      class="btn btn-sm btn-outline-primary"
                      type="button"
                      @click="manageStock(record)"
                    >
                      <i class="bi bi-box-arrow-in-down me-1"></i> Stock
                    </button>
                    <button class="btn btn-sm btn-light action-button" type="button" title="កែប្រែ" aria-label="កែប្រែ" @click="editRecord(record)"><i class="bi bi-pencil"></i></button>
                    <button class="btn btn-sm btn-light action-button text-danger" type="button" title="លុប" aria-label="លុប" @click="removeRecord(record)"><i class="bi bi-trash3"></i></button>
                  </template>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <PaginationControls :pagination="pagination" @change="loadRecords" />
    </div>
  </section>
</template>
