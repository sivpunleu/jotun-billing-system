<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import {
  productApi,
  purchaseApi,
  supplierApi,
} from '../api/invoices'
import { canManageBilling } from '../auth/session'
import ErrorState from '../components/ErrorState.vue'
import PaginationControls from '../components/PaginationControls.vue'
import TableSkeleton from '../components/TableSkeleton.vue'
import { formatDate, formatMoney, toDateInput } from '../utils/invoice'
import {
  requestConfirmation,
  showToast,
  validateForm,
} from '../ui/feedback'

const purchases = ref([])
const route = useRoute()
const suppliers = ref([])
const products = ref([])
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const search = ref('')
const status = ref('')
const editingId = ref('')
const pagination = reactive({ page: 1, limit: 10, total: 0, pages: 1 })

const newItem = () => ({
  productId: '',
  quantity: 1,
  unitCost: 0,
})

const form = reactive({
  purchaseDate: toDateInput(new Date()),
  supplierId: '',
  notes: '',
  items: [newItem()],
})

const subtotal = computed(() =>
  Math.round(
    form.items.reduce(
      (sum, item) =>
        sum + Number(item.quantity || 0) * Number(item.unitCost || 0),
      0,
    ) * 100,
  ) / 100,
)

const resetForm = () => {
  editingId.value = ''
  Object.assign(form, {
    purchaseDate: toDateInput(new Date()),
    supplierId: '',
    notes: '',
    items: [newItem()],
  })
}

const addItem = () => form.items.push(newItem())

const removeItem = (index) => {
  if (form.items.length === 1) {
    showToast('Purchase ត្រូវមានទំនិញយ៉ាងតិចមួយ', 'warning')
    return
  }
  form.items.splice(index, 1)
}

const selectedProduct = (item) =>
  products.value.find(
    (product) => String(product._id) === String(item.productId),
  )

const applyProduct = (item) => {
  const product = selectedProduct(item)
  if (!product) return
  item.unitCost = Number(product.costPrice || 0)
}

const loadOptions = async () => {
  const [supplierResult, productResult] = await Promise.all([
    supplierApi.list({ limit: 100 }),
    productApi.list({ limit: 100 }),
  ])
  suppliers.value = supplierResult.data.items || []
  products.value = productResult.data.items || []
}

const loadPurchases = async (page = pagination.page) => {
  loading.value = true
  error.value = ''
  try {
    const { data } = await purchaseApi.list({
      search: search.value,
      status: status.value,
      page,
      limit: pagination.limit,
    })
    purchases.value = data.items || []
    Object.assign(pagination, data.pagination)
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || 'Unable to load purchases'
  } finally {
    loading.value = false
  }
}

let searchTimer
const handleSearch = () => {
  clearTimeout(searchTimer)
  searchTimer = window.setTimeout(() => loadPurchases(1), 300)
}

const savePurchase = async (event) => {
  if (!(await validateForm(event.currentTarget))) return
  saving.value = true
  error.value = ''
  try {
    const payload = {
      purchaseDate: form.purchaseDate,
      supplierId: form.supplierId,
      notes: form.notes,
      items: form.items.map((item) => ({
        productId: item.productId,
        quantity: Number(item.quantity),
        unitCost: Number(item.unitCost),
      })),
    }
    if (editingId.value) {
      await purchaseApi.update(editingId.value, payload)
      showToast('Purchase draft បានកែប្រែជោគជ័យ')
    } else {
      await purchaseApi.create(payload)
      showToast('Purchase draft បានបង្កើតជោគជ័យ')
    }
    resetForm()
    await loadPurchases(1)
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || 'Unable to save purchase'
    showToast(error.value, 'error')
  } finally {
    saving.value = false
  }
}

const editPurchase = (purchase) => {
  editingId.value = purchase._id
  Object.assign(form, {
    purchaseDate: toDateInput(purchase.purchaseDate),
    supplierId: String(purchase.supplierId || ''),
    notes: purchase.notes || '',
    items: (purchase.items || []).map((item) => ({
      productId: String(item.productId || ''),
      quantity: Number(item.quantity || 1),
      unitCost: Number(item.unitCost || 0),
    })),
  })
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

const receivePurchase = async (purchase) => {
  const confirmed = await requestConfirmation({
    title: 'ទទួលទំនិញចូល Stock?',
    message: `${purchase.purchaseNumber} នឹងបន្ថែមបរិមាណទៅ Stock និងធ្វើបច្ចុប្បន្នភាព Cost Price។`,
    confirmLabel: 'ទទួលទំនិញ',
    cancelLabel: 'បោះបង់',
  })
  if (!confirmed) return
  try {
    await purchaseApi.receive(purchase._id)
    showToast('ទំនិញបានចូល Stock ជោគជ័យ')
    if (editingId.value === purchase._id) resetForm()
    await Promise.all([loadPurchases(pagination.page), loadOptions()])
  } catch (requestError) {
    showToast(
      requestError.response?.data?.message || 'Unable to receive purchase',
      'error',
    )
  }
}

const cancelPurchase = async (purchase) => {
  const confirmed = await requestConfirmation({
    title: 'បោះបង់ Purchase draft?',
    message: `${purchase.purchaseNumber} នឹងមិនបញ្ចូលទំនិញទៅ Stock ទេ។`,
    confirmLabel: 'បោះបង់ Purchase',
    cancelLabel: 'រក្សាទុក',
    tone: 'danger',
  })
  if (!confirmed) return
  try {
    await purchaseApi.cancel(purchase._id)
    showToast('Purchase ត្រូវបានបោះបង់')
    if (editingId.value === purchase._id) resetForm()
    await loadPurchases(pagination.page)
  } catch (requestError) {
    showToast(
      requestError.response?.data?.message || 'Unable to cancel purchase',
      'error',
    )
  }
}

onMounted(async () => {
  if (route.query.search) search.value = String(route.query.search)
  try {
    await Promise.all([loadOptions(), loadPurchases()])
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || 'Unable to load purchase data'
    loading.value = false
  }
})

watch(
  () => route.query.search,
  (value) => {
    if (!value) return
    search.value = String(value)
    loadPurchases(1)
  },
)
</script>

<template>
  <section class="container page-section">
    <div class="page-heading">
      <div>
        <span class="eyebrow">PURCHASE & INVENTORY</span>
        <h1>ការទិញចូល</h1>
        <p>កត់ត្រាទំនិញពីអ្នកផ្គត់ផ្គង់ និងបញ្ចូល Stock ដោយមាន Cost Price ត្រឹមត្រូវ។</p>
      </div>
    </div>

    <div v-if="error && purchases.length" class="alert alert-danger">
      {{ error }}
    </div>

    <div
      v-if="canManageBilling"
      class="content-card form-card mb-4"
    >
      <div class="section-title">
        <span class="section-number">{{ editingId ? 'EDIT' : 'NEW' }}</span>
        <div>
          <h2>{{ editingId ? 'កែ Purchase draft' : 'បង្កើត Purchase draft' }}</h2>
          <p>រក្សាទុកជា Draft រួចពិនិត្យម្តងទៀត មុនចុចទទួលទំនិញចូល Stock។</p>
        </div>
      </div>

      <form novalidate @submit.prevent="savePurchase">
        <div class="row g-3 mb-3">
          <div class="col-md-4">
            <label class="form-label">ថ្ងៃទិញ *</label>
            <input
              v-model="form.purchaseDate"
              class="form-control"
              type="date"
              required
            />
          </div>
          <div class="col-md-5">
            <label class="form-label">អ្នកផ្គត់ផ្គង់ *</label>
            <select v-model="form.supplierId" class="form-select" required>
              <option value="">-- ជ្រើសអ្នកផ្គត់ផ្គង់ --</option>
              <option
                v-for="supplier in suppliers"
                :key="supplier._id"
                :value="supplier._id"
              >
                {{ supplier.name }}
              </option>
            </select>
          </div>
          <div class="col-md-3">
            <label class="form-label">សរុប</label>
            <div class="purchase-total-field">{{ formatMoney(subtotal) }}</div>
          </div>
        </div>

        <div class="purchase-items">
          <div
            v-for="(item, index) in form.items"
            :key="index"
            class="purchase-item-row"
          >
            <div class="purchase-item-heading">
              <strong>ទំនិញទី {{ index + 1 }}</strong>
              <button
                class="btn btn-sm btn-link text-danger"
                type="button"
                @click="removeItem(index)"
              >
                <i class="bi bi-trash3 me-1"></i>លុប
              </button>
            </div>
            <div class="row g-3 align-items-end">
              <div class="col-lg-6">
                <label class="form-label">ទំនិញ *</label>
                <select
                  v-model="item.productId"
                  class="form-select"
                  required
                  @change="applyProduct(item)"
                >
                  <option value="">-- ជ្រើសទំនិញ --</option>
                  <option
                    v-for="product in products"
                    :key="product._id"
                    :value="product._id"
                  >
                    {{ product.name }}
                    {{ product.colorCode ? `(${product.colorCode})` : '' }}
                  </option>
                </select>
              </div>
              <div class="col-sm-4 col-lg-2">
                <label class="form-label">បរិមាណ *</label>
                <input
                  v-model.number="item.quantity"
                  class="form-control"
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                />
              </div>
              <div class="col-sm-4 col-lg-2">
                <label class="form-label">Cost / Unit *</label>
                <input
                  v-model.number="item.unitCost"
                  class="form-control"
                  type="number"
                  min="0"
                  step="0.01"
                  required
                />
              </div>
              <div class="col-sm-4 col-lg-2">
                <label class="form-label">Amount</label>
                <div class="purchase-line-total">
                  {{
                    formatMoney(
                      Number(item.quantity || 0) *
                        Number(item.unitCost || 0),
                    )
                  }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <button
          class="btn btn-outline-primary mb-3"
          type="button"
          @click="addItem"
        >
          <i class="bi bi-plus-lg me-1"></i> បន្ថែមទំនិញ
        </button>

        <div class="mb-3">
          <label class="form-label">កំណត់ចំណាំ</label>
          <textarea
            v-model.trim="form.notes"
            class="form-control"
            rows="2"
            maxlength="500"
          ></textarea>
        </div>

        <div class="d-flex flex-wrap gap-2">
          <button class="btn btn-danger" type="submit" :disabled="saving">
            <span
              v-if="saving"
              class="spinner-border spinner-border-sm me-1"
            ></span>
            {{ editingId ? 'រក្សាទុកការកែប្រែ' : 'រក្សាទុក Draft' }}
          </button>
          <button
            v-if="editingId"
            class="btn btn-light"
            type="button"
            @click="resetForm"
          >
            បោះបង់ការកែ
          </button>
        </div>
      </form>
    </div>

    <ErrorState
      v-if="error && !purchases.length"
      :message="error"
      :retrying="loading"
      @retry="loadPurchases(pagination.page)"
    />

    <div v-else class="content-card">
      <div class="card-toolbar purchase-toolbar">
        <div class="search-box">
          <i class="bi bi-search"></i>
          <input
            v-model="search"
            class="form-control"
            type="search"
            placeholder="ស្វែងរកលេខ Purchase ឬអ្នកផ្គត់ផ្គង់..."
            @input="handleSearch"
          />
        </div>
        <select
          v-model="status"
          class="form-select purchase-status-filter"
          @change="loadPurchases(1)"
        >
          <option value="">គ្រប់ស្ថានភាព</option>
          <option value="draft">Draft</option>
          <option value="received">Received</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      <TableSkeleton v-if="loading" />
      <div v-else-if="!purchases.length" class="empty-state">
        <div class="empty-icon"><i class="bi bi-cart-plus"></i></div>
        <h3>មិនទាន់មាន Purchase</h3>
        <p>បង្កើត Purchase draft ដើម្បីចាប់ផ្តើមកត់ត្រាការទិញចូល។</p>
      </div>
      <div v-else class="table-responsive">
        <table class="table invoice-table responsive-table mb-0">
          <thead>
            <tr>
              <th>Purchase</th>
              <th>ថ្ងៃទិញ</th>
              <th>អ្នកផ្គត់ផ្គង់</th>
              <th class="text-end">ទំនិញ</th>
              <th class="text-end">សរុប</th>
              <th>ស្ថានភាព</th>
              <th class="text-end">សកម្មភាព</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="purchase in purchases" :key="purchase._id">
              <td class="mobile-card-primary" data-label="Purchase">
                <strong>{{ purchase.purchaseNumber }}</strong>
              </td>
              <td data-label="ថ្ងៃទិញ">
                {{ formatDate(purchase.purchaseDate) }}
              </td>
              <td data-label="អ្នកផ្គត់ផ្គង់">
                {{ purchase.supplier?.name }}
              </td>
              <td class="text-end" data-label="ទំនិញ">
                {{ purchase.items?.length || 0 }}
              </td>
              <td class="text-end fw-bold" data-label="សរុប">
                {{ formatMoney(purchase.subtotal) }}
              </td>
              <td data-label="ស្ថានភាព">
                <span
                  class="status-pill"
                  :class="`purchase-status-${purchase.status}`"
                >
                  {{ purchase.status }}
                </span>
              </td>
              <td
                class="text-end text-nowrap mobile-card-actions"
                data-label="សកម្មភាព"
              >
                <template
                  v-if="canManageBilling && purchase.status === 'draft'"
                >
                  <button
                    class="btn btn-sm btn-outline-primary"
                    type="button"
                    @click="editPurchase(purchase)"
                  >
                    <i class="bi bi-pencil me-1"></i>Edit
                  </button>
                  <button
                    class="btn btn-sm btn-success"
                    type="button"
                    @click="receivePurchase(purchase)"
                  >
                    <i class="bi bi-box-arrow-in-down me-1"></i>Receive
                  </button>
                  <button
                    class="btn btn-sm btn-outline-danger"
                    type="button"
                    @click="cancelPurchase(purchase)"
                  >
                    <i class="bi bi-x-lg"></i>
                  </button>
                </template>
                <span v-else class="text-secondary">-</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <PaginationControls
        :pagination="pagination"
        @change="loadPurchases"
      />
    </div>
  </section>
</template>
