<script setup>
import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue'
import {
  onBeforeRouteLeave,
  onBeforeRouteUpdate,
  useRoute,
  useRouter,
} from 'vue-router'
import {
  customerApi,
  invoiceApi,
  productApi,
  salespersonApi,
  settingsApi,
} from '../api/invoices'
import ContentSkeleton from '../components/ContentSkeleton.vue'
import { formatMoney, toDateInput } from '../utils/invoice'
import {
  requestConfirmation,
  showToast,
  validateForm,
} from '../ui/feedback'
import logo from '../assets/logo-marvel.png'
import jotunLogo from '../assets/jotun.jpg'
import qrPlaceholder from '../assets/aba-qr-square.jpg'

const route = useRoute()
const router = useRouter()
const saving = ref(false)
const loading = ref(false)
const error = ref('')
const customers = ref([])
const products = ref([])
const salespeople = ref([])
const isEditing = computed(() => Boolean(route.params.id))
const duplicateId = computed(() => String(route.query.duplicate || ''))
const duplicatedFrom = ref('')
const formReady = ref(false)
const savedSnapshot = ref('')
const allowNavigation = ref(false)

const companySettings = reactive({
  companyName: 'Marvel Decor & JOTUN',
  companyNameKh: 'ម៉ាវែល ដេគ័រ & JOTUN',
  address: '',
  telegram: '068 8888 70',
  phones: ['098 689 883', '068 888 870'],
  paymentAccount: 'ABA : 068 888 187',
  invoiceNotes: '',
  footerKh: 'សូមអរគុណចំពោះការគាំទ្រ !',
  footerEn: 'Thank you for support !',
  invoiceFontSize: 13,
  invoicePaperSize: 'a5',
  logo: '',
  jotunLogo: '',
  paymentQr: '',
  sellerSignature: '',
})

const normalizedInvoiceFontSize = computed(() => {
  const size = Number(companySettings.invoiceFontSize)
  if (!Number.isFinite(size)) return 13
  return Math.min(18, Math.max(9, size))
})

const normalizedInvoicePaperSize = computed(() =>
  String(companySettings.invoicePaperSize || 'a5').toLowerCase() === 'a4'
    ? 'a4'
    : 'a5',
)

const invoicePaperClass = computed(
  () => `invoice-paper-${normalizedInvoicePaperSize.value}`,
)
const invoicePaperLabel = computed(() => normalizedInvoicePaperSize.value.toUpperCase())

const invoiceTypographyStyle = computed(() => {
  const base = normalizedInvoiceFontSize.value
  const size = (ratio) => `${Math.round(base * ratio * 10) / 10}px`

  return {
    '--invoice-font-size': size(1),
    '--invoice-brand-title-size': size(0.92),
    '--invoice-brand-subtitle-size': size(0.85),
    '--invoice-company-title-size': size(1.54),
    '--invoice-company-line-size': size(0.85),
    '--invoice-heading-size': size(1.46),
    '--invoice-table-header-size': size(1),
    '--invoice-total-title-size': size(0.92),
    '--invoice-small-size': size(0.85),
    '--invoice-footer-size': size(1),
    '--invoice-a5-font-size': size(0.74),
    '--invoice-a5-brand-title-size': size(0.62),
    '--invoice-a5-brand-subtitle-size': size(0.58),
    '--invoice-a5-company-title-size': size(1),
    '--invoice-a5-company-line-size': size(0.57),
    '--invoice-a5-heading-size': size(1.05),
    '--invoice-a5-table-header-size': size(0.68),
    '--invoice-a5-total-title-size': size(0.63),
    '--invoice-a5-small-size': size(0.58),
    '--invoice-a5-footer-size': size(0.64),
  }
})

const money = (value) => formatMoney(value).replace('$', '').trim()

const loadSettings = async () => {
  try {
    const response = await settingsApi.get()
    Object.assign(companySettings, response.data)
  } catch {
    // Keep local fallback branding if settings cannot be loaded.
  }
}

const addDays = (dateValue, days) => {
  const date = new Date(dateValue)
  date.setDate(date.getDate() + days)
  return toDateInput(date)
}

const newItem = () => ({
  productId: '',
  description: '',
  itemCode: '',
  colorCode: '',
  quantity: 1,
  unit: 'ធុង',
  unitPrice: 0,
  discount: 0,
  stockQuantity: 0,
  lowStockThreshold: 5,
})

const unitOptions = [
  'ធុង',
  'លីត្រ',
  'បាវ',
  'ដុំ',
  'ប្រអប់',
  'កំប៉ុង',
  'ឈុត',
  'ម៉ែត្រ',
  'គីឡូក្រាម',
  'ផ្សេងៗ',
]

const defaultForm = () => ({
  invoiceNumber: '',
  invoiceDate: toDateInput(),
  dueDate: addDays(new Date(), 7),
  customerId: '',
  customer: {
    name: '',
    phone: '',
    address: '',
  },
  salesChannel: 'store',
  salespersonId: '',
  salesperson: {
    name: '',
    phone: '',
  },
  items: [newItem()],
  discount: 0,
  taxRate: 0,
  deliveryFee: 0,
  depositRate: 0,
  status: 'unpaid',
  notes: '',
})
const form = reactive(defaultForm())

const formSnapshot = () => JSON.stringify(form)
const hasUnsavedChanges = computed(
  () =>
    formReady.value &&
    formSnapshot() !== savedSnapshot.value,
)

const resetInvoiceForm = () => {
  Object.assign(form, defaultForm())
  duplicatedFrom.value = ''
  formReady.value = false
  savedSnapshot.value = ''
  allowNavigation.value = false
}

const lineTotal = (item) =>
  Math.max(
    0,
    Number(item.quantity || 0) * Number(item.unitPrice || 0) -
      Number(item.discount || 0),
  )

const subtotal = computed(() =>
  form.items.reduce((sum, item) => sum + lineTotal(item), 0),
)
const taxableAmount = computed(() =>
  Math.max(0, subtotal.value - Number(form.discount || 0)),
)
const taxAmount = computed(
  () => taxableAmount.value * (Number(form.taxRate || 0) / 100),
)
const grandTotal = computed(
  () => taxableAmount.value + taxAmount.value + Number(form.deliveryFee || 0),
)
const depositAmount = computed(
  () => grandTotal.value * (Number(form.depositRate || 0) / 100),
)
const balanceDue = computed(() =>
  Math.max(0, grandTotal.value - depositAmount.value),
)

const loadLookups = async () => {
  const [customerResponse, productResponse, salespersonResponse] =
    await Promise.all([
    customerApi.list({ limit: 100 }),
    productApi.list({ limit: 100 }),
    salespersonApi
      .list({ limit: 100 })
      .catch(() => ({ data: { items: [] } })),
  ])
  customers.value = customerResponse.data.items || []
  products.value = productResponse.data.items || []
  salespeople.value = salespersonResponse.data.items || []
}

const applyCustomer = () => {
  const customer = customers.value.find(
    (item) => String(item._id) === String(form.customerId),
  )
  if (!customer) return
  form.customer = {
    name: customer.name || '',
    phone: customer.phone || '',
    address: customer.address || '',
  }
}

const applyProduct = (item) => {
  const product = products.value.find(
    (record) => String(record._id) === String(item.productId),
  )
  if (!product) return
  Object.assign(item, {
    description: product.name || '',
    itemCode: product.itemCode || '',
    colorCode: product.colorCode || '',
    unit: product.unit || 'ធុង',
    unitPrice: Number(product.unitPrice || 0),
    stockQuantity: Number(product.stockQuantity || 0),
    lowStockThreshold: Number(product.lowStockThreshold ?? 5),
  })
}

const changeSalesChannel = () => {
  if (form.salesChannel === 'store') {
    form.salespersonId = ''
    form.salesperson = { name: '', phone: '' }
  }
}

const applySalesperson = () => {
  const salesperson = salespeople.value.find(
    (item) => String(item._id) === String(form.salespersonId),
  )
  if (!salesperson) return
  form.salesperson = {
    name: salesperson.name || '',
    phone: salesperson.phone || '',
  }
}

const addItem = () => form.items.push(newItem())
const removeItem = async (index) => {
  if (form.items.length <= 1) return
  const itemName = form.items[index]?.description || `ផលិតផលទី ${index + 1}`
  const confirmed = await requestConfirmation({
    title: 'លុបផលិតផលនេះ?',
    message: `"${itemName}" នឹងត្រូវដកចេញពីវិក្កយបត្រនេះ។`,
    confirmLabel: 'លុប',
    cancelLabel: 'បោះបង់',
    tone: 'danger',
  })
  if (confirmed) form.items.splice(index, 1)
}

const loadInvoice = async () => {
  const sourceId = isEditing.value ? route.params.id : duplicateId.value
  if (!sourceId) return
  const { data } = await invoiceApi.get(sourceId)
  Object.assign(form, {
    invoiceNumber: isEditing.value ? data.invoiceNumber : '',
    invoiceDate: isEditing.value ? toDateInput(data.invoiceDate) : toDateInput(),
    dueDate: isEditing.value
      ? toDateInput(data.dueDate)
      : addDays(new Date(), 7),
    customerId: data.customerId || '',
    customer: { ...data.customer },
    salesChannel: data.salesChannel || 'store',
    salespersonId: data.salespersonId || '',
    salesperson: {
      name: data.salesperson?.name || '',
      phone: data.salesperson?.phone || '',
    },
    discount: Number(data.discount || 0),
    taxRate: Number(data.taxRate || 0),
    deliveryFee: Number(data.deliveryFee || 0),
    depositRate: Number(data.depositRate || 0),
    status: isEditing.value
      ? data.status ||
        (data.paymentStatus === 'partial'
          ? 'partially_paid'
          : data.paymentStatus || 'unpaid')
      : 'unpaid',
    notes: data.notes || '',
    items: Array.isArray(data.items)
      ? data.items.map((item) => {
          const product = products.value.find((p) => String(p._id) === String(item.productId))
          return {
            productId: item.productId || '',
            description: item.description,
            itemCode: item.itemCode || '',
            colorCode: item.colorCode || '',
            quantity: item.quantity,
            unit: item.unit || 'ធុង',
            unitPrice: item.unitPrice,
            discount: item.discount || 0,
            stockQuantity: product ? (product.stockQuantity || 0) : 0,
            lowStockThreshold: product ? (product.lowStockThreshold ?? 5) : 5,
          }
        })
      : [newItem()],
  })
  if (!isEditing.value) duplicatedFrom.value = data.invoiceNumber || ''
}

const initialize = async () => {
  loading.value = true
  error.value = ''
  try {
    await Promise.all([loadLookups(), loadInvoice(), loadSettings()])
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || 'មិនអាចទាញយកទិន្នន័យបានទេ'
  } finally {
    loading.value = false
    formReady.value = !error.value
    savedSnapshot.value = formSnapshot()
  }
}

const submitForm = async (event) => {
  const dueDateInvalid =
    form.invoiceDate &&
    form.dueDate &&
    new Date(form.dueDate) < new Date(form.invoiceDate)
  const invalidDiscount = form.items.some(
    (item) =>
      Number(item.discount || 0) >
      Number(item.quantity || 0) * Number(item.unitPrice || 0),
  )
  const customMessage = dueDateInvalid
    ? 'ថ្ងៃកំណត់បង់ប្រាក់ មិនអាចមុនកាលបរិច្ឆេទវិក្កយបត្របានទេ។'
    : invalidDiscount
      ? 'បញ្ចុះតម្លៃផលិតផល មិនអាចលើសតម្លៃសរុបរបស់ផលិតផលបានទេ។'
      : ''
  if (
    !(await validateForm(event?.currentTarget, {
      customMessage,
    }))
  ) return

  saving.value = true
  error.value = ''
  try {
    const payload = JSON.parse(JSON.stringify(form))
    const response = isEditing.value
      ? await invoiceApi.update(route.params.id, payload)
      : await invoiceApi.create(payload)
    showToast(
      isEditing.value
        ? 'កែប្រែវិក្កយបត្របានជោគជ័យ'
        : 'បង្កើតវិក្កយបត្របានជោគជ័យ',
    )
    allowNavigation.value = true
    savedSnapshot.value = formSnapshot()
    await router.push({
      name: 'invoice-preview',
      params: { id: response.data._id },
    })
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || 'មិនអាចរក្សាទុកវិក្កយបត្របានទេ'
    showToast(error.value, 'error')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } finally {
    saving.value = false
  }
}

const confirmLeave = () =>
  requestConfirmation({
    title: 'ចាកចេញដោយមិនរក្សាទុក?',
    message:
      'ទិន្នន័យដែលអ្នកបានកែប្រែនៅលើវិក្កយបត្រនេះមិនទាន់បានរក្សាទុកទេ។',
    confirmLabel: 'ចាកចេញ',
    cancelLabel: 'បន្តកែប្រែ',
    tone: 'danger',
  })

onBeforeRouteLeave(async () => {
  if (allowNavigation.value || !hasUnsavedChanges.value) return true
  return confirmLeave()
})

onBeforeRouteUpdate(async () => {
  if (allowNavigation.value || !hasUnsavedChanges.value) return true
  return confirmLeave()
})

const handleBeforeUnload = (event) => {
  if (!hasUnsavedChanges.value || allowNavigation.value) return
  event.preventDefault()
  event.returnValue = ''
}

watch(
  () => route.fullPath,
  () => {
    if (!['invoice-create', 'invoice-edit'].includes(route.name)) return
    resetInvoiceForm()
    initialize()
  },
)

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload)
  initialize()
})

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
})
</script>

<template>
  <section class="container page-section">
    <div class="page-heading compact">
      <div>
        <span class="eyebrow">{{ isEditing ? 'EDIT INVOICE' : 'NEW INVOICE' }}</span>
        <h1>{{ isEditing ? 'កែប្រែវិក្កយបត្រ' : 'បង្កើតវិក្កយបត្រថ្មី' }}</h1>
        <p>ជ្រើសអតិថិជន និងទំនិញដែលបានរក្សាទុក ឬបញ្ចូលថ្មីដោយដៃ។</p>
      </div>
      <RouterLink class="btn btn-outline-secondary" to="/invoices">
        <i class="bi bi-arrow-left me-1"></i> ត្រឡប់ក្រោយ
      </RouterLink>
    </div>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>
    <div
      v-if="duplicatedFrom && !isEditing"
      class="duplicate-invoice-notice"
    >
      <i class="bi bi-copy"></i>
      <span>
        ចម្លងពីវិក្កយបត្រ <strong>{{ duplicatedFrom }}</strong>។ លេខវិក្កយបត្រថ្មី
        នឹងបង្កើតដោយស្វ័យប្រវត្តិពេលរក្សាទុក។
      </span>
    </div>
    <ContentSkeleton v-if="loading" :cards="3" />

    <form v-else novalidate @submit.prevent="submitForm">
      <div class="row g-4">
        <div class="col-lg-7">
          <div class="content-card form-card mb-4">
            <div class="section-title">
              <span class="section-number">01</span>
              <div><h2>ព័ត៌មានវិក្កយបត្រ</h2><p>លេខវិក្កយបត្របង្កើតដោយស្វ័យប្រវត្តិ និងមិនស្ទួន។</p></div>
            </div>
            <div class="row g-3">
              <div class="col-md-6">
                <label class="form-label">លេខវិក្កយបត្រ</label>
                <input
                  class="form-control"
                  :value="isEditing ? form.invoiceNumber : 'បង្កើតស្វ័យប្រវត្តិពេលរក្សាទុក'"
                  disabled
                />
                <small class="form-hint">Invoice number is reserved when you save.</small>
              </div>
              <div class="col-md-3">
                <label class="form-label">កាលបរិច្ឆេទ *</label>
                <input v-model="form.invoiceDate" class="form-control" type="date" required />
                <small class="form-hint">Used for invoice numbering and reports.</small>
              </div>
              <div class="col-md-3">
                <label class="form-label">ថ្ងៃកំណត់ *</label>
                <input v-model="form.dueDate" class="form-control" type="date" required />
                <small class="form-hint">Must be same day or after invoice date.</small>
              </div>
              <div class="col-md-6 sales-source-field">
                <label class="form-label">ប្រភពការលក់ *</label>
                <select
                  v-model="form.salesChannel"
                  class="form-select sales-source-control"
                  required
                  @change="changeSalesChannel"
                >
                  <option value="store">ទិញនៅហាងផ្ទាល់</option>
                  <option value="salesperson">Sale ជាអ្នកលក់</option>
                </select>
              </div>
              <div
                v-if="form.salesChannel === 'salesperson'"
                class="col-md-6 sales-source-field"
              >
                <label class="form-label">ឈ្មោះ Sale *</label>
                <select
                  v-model="form.salespersonId"
                  class="form-select sales-source-control"
                  required
                  @change="applySalesperson"
                >
                  <option value="">-- ជ្រើសរើស Sale --</option>
                  <option
                    v-if="
                      form.salespersonId &&
                      !salespeople.some(
                        (item) => String(item._id) === String(form.salespersonId),
                      )
                    "
                    :value="form.salespersonId"
                  >
                    {{ form.salesperson.name }}
                  </option>
                  <option
                    v-for="salesperson in salespeople"
                    :key="salesperson._id"
                    :value="salesperson._id"
                  >
                    {{ salesperson.name }}
                    {{ salesperson.phone ? `· ${salesperson.phone}` : '' }}
                  </option>
                </select>
                <small class="form-text text-secondary">
                  មិនឃើញឈ្មោះ?
                  <RouterLink to="/salespeople">បន្ថែម Sale ថ្មី</RouterLink>
                </small>
              </div>
              <div v-else class="col-md-6 sales-source-preview-field">
                <div class="sales-source-preview">
                  <i class="bi bi-shop"></i>
                  <span>
                    <strong>ទិញនៅហាងផ្ទាល់</strong>
                    <small>Invoice នេះនឹងត្រូវរាប់ជាការលក់នៅហាង។</small>
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div class="content-card form-card mb-4">
            <div class="section-title">
              <span class="section-number">02</span>
              <div><h2>ព័ត៌មានអតិថិជន</h2><p>ជ្រើសពីបញ្ជី ដើម្បីបំពេញទិន្នន័យដោយស្វ័យប្រវត្តិ។</p></div>
            </div>
            <div class="row g-3">
              <div class="col-12">
                <label class="form-label">ជ្រើសអតិថិជនដែលបានរក្សាទុក</label>
                <select v-model="form.customerId" class="form-select" @change="applyCustomer">
                  <option value="">-- បញ្ចូលអតិថិជនថ្មីដោយដៃ --</option>
                  <option v-for="customer in customers" :key="customer._id" :value="customer._id">
                    {{ customer.name }} {{ customer.phone ? `· ${customer.phone}` : '' }}
                  </option>
                </select>
              </div>
              <div class="col-md-6">
                <label class="form-label">ឈ្មោះអតិថិជន *</label>
                <input v-model.trim="form.customer.name" class="form-control" required />
                <small class="form-hint">Required for invoice, search, and statements.</small>
              </div>
              <div class="col-md-6">
                <label class="form-label">លេខទូរស័ព្ទ</label>
                <input
                  v-model.trim="form.customer.phone"
                  class="form-control"
                  type="tel"
                  pattern="[0-9+() -]{7,20}"
                  title="សូមបញ្ចូលលេខទូរស័ព្ទត្រឹមត្រូវ"
                />
              </div>
              <div class="col-12">
                <label class="form-label">អាសយដ្ឋាន</label>
                <textarea v-model.trim="form.customer.address" class="form-control" rows="2"></textarea>
              </div>
            </div>
          </div>

          <div class="content-card form-card mb-4">
            <div class="section-title">
              <span class="section-number">03</span>
              <div><h2>ផលិតផល</h2><p>ជ្រើសពី catalogue ឬបញ្ចូលទំនិញថ្មីដោយដៃ។</p></div>
            </div>
            <div class="items-list">
              <div v-for="(item, index) in form.items" :key="index" class="item-row invoice-item-card">
                <div class="item-row-heading">
                  <span>
                    <strong>ផលិតផលទី {{ index + 1 }}</strong>
                    <small>{{ item.description || 'New invoice item' }}</small>
                  </span>
                  <button class="btn btn-sm btn-link text-danger" type="button" :disabled="form.items.length === 1" @click="removeItem(index)">
                    <i class="bi bi-trash3 me-1"></i> លុប
                  </button>
                </div>
                <div class="row g-3">
                  <div class="col-12">
                    <label class="form-label">ជ្រើសពី Product Catalogue</label>
                    <select v-model="item.productId" class="form-select" @change="applyProduct(item)">
                      <option value="">-- បញ្ចូលដោយដៃ --</option>
                      <option v-for="product in products" :key="product._id" :value="product._id">
                        {{ product.name }} · {{ product.itemCode || 'No code' }} · {{ formatMoney(product.unitPrice) }}/{{ product.unit }} (ស្តុក: {{ product.stockQuantity || 0 }} {{ product.unit }})
                      </option>
                    </select>
                  </div>
                  <div class="col-md-5">
                    <label class="form-label">ឈ្មោះផលិតផល *</label>
                    <input v-model.trim="item.description" class="form-control" required />
                    <small class="form-hint">This text appears in the printed invoice.</small>
                  </div>
                  <div class="col-md-2">
                    <label class="form-label">Color Code</label>
                    <input v-model.trim="item.colorCode" class="form-control" />
                  </div>
                  <div class="col-md-2">
                    <label class="form-label">បរិមាណ *</label>
                    <input v-model.number="item.quantity" class="form-control" type="number" min="0.01" step="0.01" required />
                    <small v-if="item.productId" class="product-stock-info" :class="{ 'product-stock-low': item.stockQuantity <= item.lowStockThreshold }">
                      ស្តុក៖ {{ item.stockQuantity }} {{ item.unit }}
                    </small>
                    <div v-if="item.productId && item.quantity > item.stockQuantity" class="stock-warning-badge">
                      <i class="bi bi-exclamation-triangle"></i> លើសស្តុក
                    </div>
                  </div>
                  <div class="col-md-3">
                    <label class="form-label">ឯកតា *</label>
                    <input
                      v-model.trim="item.unit"
                      class="form-control"
                      list="invoice-unit-options"
                      placeholder="វាយ ឬជ្រើសឯកតា"
                      autocomplete="off"
                      required
                    />
                    <small class="form-hint">អាចបញ្ចូលឯកតាថ្មីដោយដៃបាន។</small>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label">តម្លៃរាយ *</label>
                    <div class="input-group"><span class="input-group-text">$</span><input v-model.number="item.unitPrice" class="form-control" type="number" min="0" step="0.01" required /></div>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label">បញ្ចុះតម្លៃ</label>
                    <div class="input-group"><span class="input-group-text">$</span><input v-model.number="item.discount" class="form-control" type="number" min="0" :max="Number(item.quantity || 0) * Number(item.unitPrice || 0)" step="0.01" /></div>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label">សរុប</label>
                    <div class="line-total">{{ formatMoney(lineTotal(item)) }}</div>
                  </div>
                </div>
              </div>
            </div>
            <datalist id="invoice-unit-options">
              <option v-for="option in unitOptions" :key="option" :value="option">{{ option }}</option>
            </datalist>
            <button class="btn btn-outline-primary" type="button" @click="addItem">
              <i class="bi bi-plus-lg me-1"></i> បន្ថែមផលិតផល
            </button>
          </div>

          <div class="content-card form-card mb-4">
            <div class="section-title">
              <span class="section-number">04</span>
              <div><h2>កំណត់ចំណាំ</h2><p>លក្ខខណ្ឌបង់ប្រាក់ ឬព័ត៌មានបន្ថែម។</p></div>
            </div>
            <textarea v-model.trim="form.notes" class="form-control" rows="4"></textarea>
          </div>

          <div class="content-card form-card totals-card mb-4">
            <h2>សេចក្ដីសង្ខេប</h2>
            <div class="mb-3">
              <label class="form-label">ស្ថានភាព</label>
              <select v-model="form.status" class="form-select">
                <option value="draft">Draft</option>
                <option value="unpaid">Unpaid</option>
                <option value="partially_paid">Partially Paid</option>
                <option value="paid">Paid</option>
                <option value="cancelled">Cancelled</option>
              </select>
              <small class="text-secondary">Paid/Partially Paid នឹងកែដោយស្វ័យប្រវត្តិតាម Payment History។</small>
            </div>
            <div class="mb-3">
              <label class="form-label">បញ្ចុះតម្លៃវិក្កយបត្រ</label>
              <div class="input-group"><span class="input-group-text">$</span><input v-model.number="form.discount" class="form-control" type="number" min="0" :max="subtotal" step="0.01" /></div>
            </div>
            <div class="mb-3">
              <label class="form-label">ពន្ធ</label>
              <div class="input-group"><input v-model.number="form.taxRate" class="form-control" type="number" min="0" max="100" step="0.01" /><span class="input-group-text">%</span></div>
            </div>
            <div class="mb-3">
              <label class="form-label">ថ្លៃដឹកជញ្ជូន</label>
              <div class="input-group"><span class="input-group-text">$</span><input v-model.number="form.deliveryFee" class="form-control" type="number" min="0" step="0.01" /></div>
            </div>
            <div class="mb-4">
              <label class="form-label">ប្រាក់កក់ដែលបានបង់</label>
              <div class="input-group"><input v-model.number="form.depositRate" class="form-control" type="number" min="0" max="100" step="0.01" /><span class="input-group-text">%</span></div>
            </div>

            <div class="totals-breakdown">
              <div><span>សរុបរង</span><strong>{{ formatMoney(subtotal) }}</strong></div>
              <div><span>បញ្ចុះតម្លៃ</span><strong>-{{ formatMoney(form.discount) }}</strong></div>
              <div><span>ពន្ធ</span><strong>{{ formatMoney(taxAmount) }}</strong></div>
              <div><span>ដឹកជញ្ជូន</span><strong>{{ formatMoney(form.deliveryFee) }}</strong></div>
              <div><span>ប្រាក់កក់</span><strong>-{{ formatMoney(depositAmount) }}</strong></div>
              <div class="grand-total"><span>ប្រាក់នៅសល់</span><strong>{{ formatMoney(balanceDue) }}</strong></div>
            </div>

            <button class="btn btn-brand btn-lg w-100 mt-4" type="submit" :disabled="saving">
              <span v-if="saving" class="spinner-border spinner-border-sm me-2"></span>
              <i v-else class="bi bi-check2-circle me-2"></i>
              {{ saving ? 'កំពុងរក្សាទុក...' : 'រក្សាទុកវិក្កយបត្រ' }}
            </button>
          </div>
        </div>

        <!-- Right Column: Live A4/A5 Print Preview (Sticky) -->
        <div class="col-lg-5 d-none d-lg-block">
          <div class="invoice-form-preview-col">
            <div class="invoice-preview-meta mb-3">
              <span>
                <i class="bi bi-file-earmark-text"></i>
                {{ invoicePaperLabel }} Live Preview
              </span>
              <small class="text-secondary">រាល់ការកែប្រែនឹងបង្ហាញឡើងភ្លាមៗ។</small>
            </div>
            <div class="invoice-scroll-frame">
              <article
                class="invoice-paper classic-invoice"
                :class="invoicePaperClass"
                :style="invoiceTypographyStyle"
              >
                <header class="classic-header">
                  <div class="classic-brand-block">
                    <img class="classic-logo" :src="companySettings.logo || logo" alt="Marvel Decor" />
                    <div class="classic-brand-copy">
                      <h5 class="classic-brand-title">ម៉ាវែល ដេគ័រ</h5>
                      <h6 class="classic-subtitle">Marvel Decor</h6>
                    </div>
                  </div>
                  <div class="company-copy">
                    <h1>{{ companySettings.companyNameKh || companySettings.companyName }}</h1>
                    <p v-if="companySettings.companyName">
                      {{ companySettings.companyName }}
                    </p>
                    <p v-if="companySettings.address">
                      អាស័យដ្ឋាន : {{ companySettings.address }}
                    </p>
                    <p v-if="companySettings.telegram">
                      Telegram : {{ companySettings.telegram }}
                    </p>
                    <p v-for="phone in companySettings.phones" :key="phone">
                      លេខទូរស័ព្ទ | Phone: {{ phone }}
                    </p>
                  </div>
                  <div class="classic-jotun-block">
                    <img
                      class="classic-jotun-logo"
                      :src="companySettings.jotunLogo || jotunLogo"
                      alt="Jotun"
                      style="width: 150px; height: 50px"
                    />
                  </div>
                </header>

                <div class="invoice-heading">
                  <h2>វិក្កយបត្រ / INVOICE</h2>
                </div>

                <section class="classic-customer">
                  <div class="customer-details">
                    <div class="invoice-info-row">
                      <strong>អតិថិជន | Customer:</strong>
                      <span>{{ form.customer?.name || '-' }}</span>
                    </div>
                    <div class="invoice-info-row">
                      <strong>លេខទូរស័ព្ទ | Phone:</strong>
                      <span>{{ form.customer?.phone || '-' }}</span>
                    </div>
                    <div class="invoice-info-row">
                      <strong>អាសយដ្ឋាន | Address:</strong>
                      <span>{{ form.customer?.address || '-' }}</span>
                    </div>
                  </div>
                  <div class="classic-meta">
                    <div class="invoice-info-row">
                      <strong>កាលបរិច្ឆេទ | Date:</strong>
                      <span>{{ form.invoiceDate ? formatDate(form.invoiceDate) : '-' }}</span>
                    </div>
                    <div class="invoice-info-row">
                      <strong>វិក្កយបត្រ | Invoice No:</strong>
                      <span>{{ isEditing ? form.invoiceNumber : 'INV-YYYY-XXXXX' }}</span>
                    </div>
                    <div class="invoice-info-row">
                      <strong>ប្រភពលក់ | Sold By:</strong>
                      <span>
                        {{
                          form.salesChannel === 'salesperson'
                            ? form.salesperson?.name || '-'
                            : 'ទិញនៅហាងផ្ទាល់'
                        }}
                      </span>
                    </div>
                  </div>
                </section>

                <table class="classic-table">
                  <thead>
                    <tr>
                      <th class="number-column">ល.រ<br />No.</th>
                      <th>ឈ្មោះ និងបរិយាយទំនិញ<br />Item &amp; Description</th>
                      <th class="code-column">លេខកូដពណ៌<br />Color Code</th>
                      <th class="qty-column">ចំនួន<br />Qty</th>
                      <th class="money-column">តម្លៃ<br />Unit Price</th>
                      <th class="money-column">សរុប<br />Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(item, index) in form.items" :key="index">
                      <td class="text-center">{{ index + 1 }}</td>
                      <td>{{ item.description || '-' }}</td>
                      <td class="text-center">{{ item.colorCode || '-' }}</td>
                      <td class="text-center qty-value">
                        {{ item.quantity }}
                        <span v-if="item.unit">{{ item.unit }}</span>
                      </td>
                      <td class="currency-cell">
                        <span>$</span>
                        <strong>{{ money(item.unitPrice) }}</strong>
                      </td>
                      <td class="currency-cell">
                        <span>$</span>
                        <strong>{{ money(lineTotal(item)) }}</strong>
                      </td>
                    </tr>
                    <tr
                      v-for="index in Math.max(0, 4 - form.items.length)"
                      :key="`blank-${index}`"
                      class="blank-item-row"
                    >
                      <td>&nbsp;</td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>

                <section class="classic-settlement">
                  <div class="classic-payment">
                    <div class="payment-notes">
                      <p v-if="form.notes">{{ form.notes }}</p>
                      <template v-else-if="companySettings.invoiceNotes">
                        <p>{{ companySettings.invoiceNotes }}</p>
                      </template>
                      <template v-else>
                        <p>- ទំនិញទិញហើយមិនអាចប្តូរ ឬសងត្រឡប់វិញបានទេ</p>
                        <p>- រាល់ការទូទាត់ត្រូវមានវិក្កយបត្រត្រឹមត្រូវ</p>
                      </template>
                    </div>
                    <div class="qr-block">
                      <p>ទូទាត់តាមរយៈ៖</p>
                      <strong>{{ companySettings.paymentAccount }}</strong>
                      <img :src="companySettings.paymentQr || qrPlaceholder" alt="ABA payment QR" />
                    </div>
                  </div>

                  <table class="classic-totals">
                    <tbody>
                      <tr>
                        <th>សរុប<br /><span>Total Price</span></th>
                        <td><span>$</span><strong>{{ money(subtotal) }}</strong></td>
                      </tr>
                      <tr v-if="Number(form.discount || 0) > 0">
                        <th>បញ្ចុះតម្លៃ<br /><span>Discount</span></th>
                        <td><span>$</span><strong>-{{ money(form.discount) }}</strong></td>
                      </tr>
                      <tr v-if="Number(taxAmount || 0) > 0">
                        <th>ពន្ធ ({{ form.taxRate }}%)<br /><span>Tax</span></th>
                        <td><span>$</span><strong>{{ money(taxAmount) }}</strong></td>
                      </tr>
                      <tr>
                        <th>ថ្លៃដឹកជញ្ជូន<br /><span>Delivery Fee</span></th>
                        <td><span>$</span><strong>{{ money(form.deliveryFee) }}</strong></td>
                      </tr>
                      <tr>
                        <th>
                          ប្រាក់កក់ ({{ form.depositRate || 0 }}%)<br />
                          <span>Deposit ({{ form.depositRate || 0 }}%)</span>
                        </th>
                        <td><span>$</span><strong>{{ money(depositAmount) }}</strong></td>
                      </tr>
                      <tr>
                        <th>ប្រាក់នៅសល់<br /><span>Balance Due</span></th>
                        <td><span>$</span><strong>{{ money(balanceDue) }}</strong></td>
                      </tr>
                    </tbody>
                  </table>
                </section>

                <section class="signature-section">
                  <div class="signature-box">
                    <div class="signature-space"></div>
                    <div class="signature-line"></div>
                    <p>ហត្ថលេខា និងឈ្មោះ អតិថិជន</p>
                    <span>Customer's Signature &amp; Name</span>
                  </div>
                  <div class="signature-box">
                    <div class="signature-space seller-mark">
                      <img
                        v-if="companySettings.sellerSignature"
                        class="seller-signature-image"
                        :src="companySettings.sellerSignature"
                        alt="Seller signature"
                      />
                    </div>
                    <div class="signature-line"></div>
                    <p>ហត្ថលេខា និងឈ្មោះ អ្នកលក់</p>
                    <span>Seller's Signature &amp; Name</span>
                  </div>
                </section>

                <footer class="classic-footer">
                  <span>{{ companySettings.footerEn }}</span>
                  <strong>{{ companySettings.footerKh }}</strong>
                </footer>
              </article>
            </div>
          </div>
        </div>
      </div>
    </form>
  </section>
</template>
