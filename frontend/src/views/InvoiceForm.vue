<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { invoiceApi } from '../api/invoices'
import { formatMoney, toDateInput } from '../utils/invoice'

const route = useRoute()
const router = useRouter()
const saving = ref(false)
const loading = ref(false)
const error = ref('')
const isEditing = computed(() => Boolean(route.params.id))

const addDays = (dateValue, days) => {
  const date = new Date(dateValue)
  date.setDate(date.getDate() + days)
  return toDateInput(date)
}

const newItem = () => ({
  description: '',
  colorCode: '',
  quantity: 1,
  unitPrice: 0,
  discount: 0,
})

const form = reactive({
  invoiceNumber: `INV-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`,
  invoiceDate: toDateInput(),
  dueDate: addDays(new Date(), 7),
  customer: {
    name: '',
    phone: '',
    address: '',
  },
  items: [newItem()],
  discount: 0,
  taxRate: 0,
  deliveryFee: 0,
  depositRate: 0,
  paymentStatus: 'unpaid',
  notes: '',
})

const lineTotal = (item) =>
  Math.max(
    0,
    Number(item.quantity || 0) * Number(item.unitPrice || 0) -
      Number(item.discount || 0),
  )

const invoiceItems = computed(() =>
  Array.isArray(form.items) ? form.items : [],
)
const subtotal = computed(() =>
  invoiceItems.value.reduce((sum, item) => sum + lineTotal(item), 0),
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

const addItem = () => {
  if (!Array.isArray(form.items)) form.items = []
  form.items.push(newItem())
}

const removeItem = (index) => {
  if (!Array.isArray(form.items)) {
    form.items = [newItem()]
    return
  }
  if (form.items.length === 1) return
  form.items.splice(index, 1)
}

const loadInvoice = async () => {
  if (!isEditing.value) return
  loading.value = true
  error.value = ''
  try {
    const { data } = await invoiceApi.get(route.params.id)
    Object.assign(form, {
      ...data,
      invoiceDate: toDateInput(data.invoiceDate),
      dueDate: toDateInput(data.dueDate),
      customer: { ...data.customer },
      items: Array.isArray(data.items)
        ? data.items.map((item) => ({
            description: item.description,
            colorCode: item.colorCode,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            discount: item.discount,
          }))
        : [newItem()],
    })
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || 'មិនអាចទាញយកវិក្កយបត្របានទេ'
  } finally {
    loading.value = false
  }
}

const submitForm = async () => {
  saving.value = true
  error.value = ''

  try {
    const payload = JSON.parse(JSON.stringify(form))
    payload.items = Array.isArray(payload.items) ? payload.items : []
    const response = isEditing.value
      ? await invoiceApi.update(route.params.id, payload)
      : await invoiceApi.create(payload)

    router.push({
      name: 'invoice-preview',
      params: { id: response.data._id },
    })
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || 'មិនអាចរក្សាទុកវិក្កយបត្របានទេ'
    window.scrollTo({ top: 0, behavior: 'smooth' })
  } finally {
    saving.value = false
  }
}

onMounted(loadInvoice)
</script>

<template>
  <section class="container page-section">
    <div class="page-heading compact">
      <div>
        <span class="eyebrow">{{ isEditing ? 'EDIT INVOICE' : 'NEW INVOICE' }}</span>
        <h1>{{ isEditing ? 'កែប្រែវិក្កយបត្រ' : 'បង្កើតវិក្កយបត្រថ្មី' }}</h1>
        <p>បញ្ចូលព័ត៌មានអតិថិជន និងផលិតផលខាងក្រោម។</p>
      </div>
      <RouterLink class="btn btn-outline-secondary" to="/invoices">
        <i class="bi bi-arrow-left me-1"></i>
        ត្រឡប់ក្រោយ
      </RouterLink>
    </div>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>
    <div v-if="loading" class="loading-state content-card">
      <div class="spinner-border text-danger" role="status"></div>
      <span>កំពុងទាញទិន្នន័យ...</span>
    </div>

    <form v-else @submit.prevent="submitForm">
      <div class="row g-4">
        <div class="col-lg-8">
          <div class="content-card form-card mb-4">
            <div class="section-title">
              <span class="section-number">01</span>
              <div>
                <h2>ព័ត៌មានវិក្កយបត្រ</h2>
                <p>លេខ និងកាលបរិច្ឆេទសម្រាប់វិក្កយបត្រនេះ</p>
              </div>
            </div>

            <div class="row g-3">
              <div class="col-md-6">
                <label class="form-label">លេខវិក្កយបត្រ *</label>
                <input
                  v-model.trim="form.invoiceNumber"
                  class="form-control"
                  required
                />
              </div>
              <div class="col-md-3">
                <label class="form-label">កាលបរិច្ឆេទ *</label>
                <input
                  v-model="form.invoiceDate"
                  class="form-control"
                  type="date"
                  required
                />
              </div>
              <div class="col-md-3">
                <label class="form-label">ថ្ងៃកំណត់ *</label>
                <input
                  v-model="form.dueDate"
                  class="form-control"
                  type="date"
                  required
                />
              </div>
            </div>
          </div>

          <div class="content-card form-card mb-4">
            <div class="section-title">
              <span class="section-number">02</span>
              <div>
                <h2>ព័ត៌មានអតិថិជន</h2>
                <p>ព័ត៌មានទំនាក់ទំនងរបស់អ្នកទិញ</p>
              </div>
            </div>

            <div class="row g-3">
              <div class="col-md-6">
                <label class="form-label">ឈ្មោះអតិថិជន *</label>
                <input
                  v-model.trim="form.customer.name"
                  class="form-control"
                  placeholder="ឈ្មោះពេញ"
                  required
                />
              </div>
              <div class="col-md-6">
                <label class="form-label">លេខទូរស័ព្ទ</label>
                <input
                  v-model.trim="form.customer.phone"
                  class="form-control"
                  placeholder="012 345 678"
                />
              </div>
              <div class="col-12">
                <label class="form-label">អាសយដ្ឋាន</label>
                <textarea
                  v-model.trim="form.customer.address"
                  class="form-control"
                  rows="2"
                  placeholder="ផ្ទះ លេខផ្លូវ សង្កាត់ ខណ្ឌ..."
                ></textarea>
              </div>
            </div>
          </div>

          <div class="content-card form-card mb-4">
            <div class="section-title">
              <span class="section-number">03</span>
              <div>
                <h2>ផលិតផល</h2>
                <p>បញ្ចូលថ្នាំពណ៌ បរិមាណ និងតម្លៃ</p>
              </div>
            </div>

            <div class="items-list">
              <div
                v-for="(item, index) in form.items"
                :key="index"
                class="item-row"
              >
                <div class="item-row-heading">
                  <strong>ផលិតផលទី {{ index + 1 }}</strong>
                  <button
                    class="btn btn-sm btn-link text-danger"
                    type="button"
                    :disabled="form.items.length === 1"
                    @click="removeItem(index)"
                  >
                    <i class="bi bi-trash3 me-1"></i>
                    លុប
                  </button>
                </div>
                <div class="row g-3">
                  <div class="col-md-6">
                    <label class="form-label">ឈ្មោះផលិតផល *</label>
                    <input
                      v-model.trim="item.description"
                      class="form-control"
                      placeholder="ឧ. Jotun Majestic True Beauty 5L"
                      required
                    />
                  </div>
                  <div class="col-md-3">
                    <label class="form-label">លេខកូដពណ៌</label>
                    <input
                      v-model.trim="item.colorCode"
                      class="form-control"
                      placeholder="1024 Tidløs"
                    />
                  </div>
                  <div class="col-md-3">
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
                  <div class="col-md-4">
                    <label class="form-label">តម្លៃរាយ *</label>
                    <div class="input-group">
                      <span class="input-group-text">$</span>
                      <input
                        v-model.number="item.unitPrice"
                        class="form-control"
                        type="number"
                        min="0"
                        step="0.01"
                        required
                      />
                    </div>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label">បញ្ចុះតម្លៃ</label>
                    <div class="input-group">
                      <span class="input-group-text">$</span>
                      <input
                        v-model.number="item.discount"
                        class="form-control"
                        type="number"
                        min="0"
                        step="0.01"
                      />
                    </div>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label">សរុប</label>
                    <div class="line-total">{{ formatMoney(lineTotal(item)) }}</div>
                  </div>
                </div>
              </div>
            </div>

            <button class="btn btn-outline-primary" type="button" @click="addItem">
              <i class="bi bi-plus-lg me-1"></i>
              បន្ថែមផលិតផល
            </button>
          </div>

          <div class="content-card form-card">
            <div class="section-title">
              <span class="section-number">04</span>
              <div>
                <h2>កំណត់ចំណាំ</h2>
                <p>លក្ខខណ្ឌបង់ប្រាក់ ឬព័ត៌មានបន្ថែម</p>
              </div>
            </div>
            <textarea
              v-model.trim="form.notes"
              class="form-control"
              rows="4"
              placeholder="សូមអរគុណសម្រាប់ការគាំទ្រ..."
            ></textarea>
          </div>
        </div>

        <div class="col-lg-4">
          <div class="content-card form-card totals-card">
            <h2>សេចក្តីសង្ខេប</h2>

            <div class="mb-3">
              <label class="form-label">ស្ថានភាពបង់ប្រាក់</label>
              <select v-model="form.paymentStatus" class="form-select">
                <option value="unpaid">មិនទាន់បង់</option>
                <option value="partial">បង់ខ្លះ</option>
                <option value="paid">បានបង់រួច</option>
              </select>
            </div>

            <div class="mb-3">
              <label class="form-label">បញ្ចុះតម្លៃលើវិក្កយបត្រ</label>
              <div class="input-group">
                <span class="input-group-text">$</span>
                <input
                  v-model.number="form.discount"
                  class="form-control"
                  type="number"
                  min="0"
                  :max="subtotal"
                  step="0.01"
                />
              </div>
            </div>

            <div class="mb-4">
              <label class="form-label">ពន្ធ</label>
              <div class="input-group">
                <input
                  v-model.number="form.taxRate"
                  class="form-control"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                />
                <span class="input-group-text">%</span>
              </div>
            </div>

            <div class="mb-3">
              <label class="form-label">ថ្លៃដឹកជញ្ជូន</label>
              <div class="input-group">
                <span class="input-group-text">$</span>
                <input
                  v-model.number="form.deliveryFee"
                  class="form-control"
                  type="number"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>

            <div class="mb-4">
              <label class="form-label">ប្រាក់កក់</label>
              <div class="input-group">
                <input
                  v-model.number="form.depositRate"
                  class="form-control"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                />
                <span class="input-group-text">%</span>
              </div>
            </div>

            <div class="totals-breakdown">
              <div>
                <span>សរុបរង</span>
                <strong>{{ formatMoney(subtotal) }}</strong>
              </div>
              <div>
                <span>បញ្ចុះតម្លៃ</span>
                <strong>-{{ formatMoney(form.discount) }}</strong>
              </div>
              <div>
                <span>ពន្ធ</span>
                <strong>{{ formatMoney(taxAmount) }}</strong>
              </div>
              <div>
                <span>ថ្លៃដឹកជញ្ជូន</span>
                <strong>{{ formatMoney(form.deliveryFee) }}</strong>
              </div>
              <div>
                <span>ប្រាក់កក់ ({{ form.depositRate || 0 }}%)</span>
                <strong>-{{ formatMoney(depositAmount) }}</strong>
              </div>
              <div class="grand-total">
                <span>ប្រាក់នៅសល់</span>
                <strong>{{ formatMoney(balanceDue) }}</strong>
              </div>
            </div>

            <button class="btn btn-danger btn-lg w-100 mt-4" type="submit" :disabled="saving">
              <span
                v-if="saving"
                class="spinner-border spinner-border-sm me-2"
                role="status"
              ></span>
              <i v-else class="bi bi-check2-circle me-2"></i>
              {{ saving ? 'កំពុងរក្សាទុក...' : 'រក្សាទុកវិក្កយបត្រ' }}
            </button>
          </div>
        </div>
      </div>
    </form>
  </section>
</template>
