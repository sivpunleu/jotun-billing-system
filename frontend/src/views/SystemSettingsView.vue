<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { settingsApi } from '../api/invoices'
import ContentSkeleton from '../components/ContentSkeleton.vue'
import {
  requestConfirmation,
  showToast,
  validateForm,
} from '../ui/feedback'

const loading = ref(true)
const saving = ref(false)
const error = ref('')
const activeTab = ref('company')
const settingsTabs = [
  { key: 'company', label: 'Company', icon: 'bi-building' },
  { key: 'invoice', label: 'Invoice', icon: 'bi-receipt' },
  { key: 'assets', label: 'Assets', icon: 'bi-images' },
]
const assetList = [
  { key: 'logo', label: 'Marvel Logo' },
  { key: 'jotunLogo', label: 'JOTUN Logo' },
  { key: 'paymentQr', label: 'ABA QR Code' },
  { key: 'sellerSignature', label: 'Seller Signature' },
]
const form = reactive({
  companyName: '',
  companyNameKh: '',
  address: '',
  telegram: '',
  phones: [],
  paymentAccount: '',
  invoiceNotes: '',
  invoiceFontSize: 13,
  invoicePaperSize: 'a5',
  footerKh: '',
  footerEn: '',
  logo: '',
  jotunLogo: '',
  paymentQr: '',
  sellerSignature: '',
})
const phoneText = ref('')
const fontSizeMin = 9
const fontSizeMax = 18

const normalizeInvoiceFontSize = (value) => {
  const size = Number(value)
  if (!Number.isFinite(size)) return 13
  return Math.min(fontSizeMax, Math.max(fontSizeMin, Math.round(size * 10) / 10))
}

const normalizeInvoicePaperSize = (value) =>
  String(value || 'a5').toLowerCase() === 'a4' ? 'a4' : 'a5'

const previewPaperClass = computed(
  () => `settings-invoice-preview-${normalizeInvoicePaperSize(form.invoicePaperSize)}`,
)
const previewStyle = computed(() => ({
  '--settings-preview-font-size': `${normalizeInvoiceFontSize(form.invoiceFontSize)}px`,
  '--settings-preview-mini-font-size': `${Math.round(
    normalizeInvoiceFontSize(form.invoiceFontSize) * 5.5,
  ) / 10}px`,
}))

const load = async () => {
  loading.value = true
  try {
    const { data } = await settingsApi.get()
    Object.assign(form, data)
    form.invoiceFontSize = normalizeInvoiceFontSize(data.invoiceFontSize)
    form.invoicePaperSize = normalizeInvoicePaperSize(data.invoicePaperSize)
    phoneText.value = (data.phones || []).join(', ')
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || 'Unable to load settings'
  } finally {
    loading.value = false
  }
}

const resizeImage = (
  file,
  {
    maxWidth = 700,
    maxHeight = Infinity,
    quality = 0.86,
    format = 'image/jpeg',
    preserveTransparency = false,
  } = {},
) =>
  new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Please choose an image file'))
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      reject(new Error('Image must be smaller than 5 MB'))
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const image = new Image()
      image.onload = () => {
        const scale = Math.min(
          1,
          maxWidth / image.width,
          maxHeight / image.height,
        )
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(image.width * scale)
        canvas.height = Math.round(image.height * scale)
        const context = canvas.getContext('2d')
        if (!preserveTransparency) {
          context.fillStyle = '#ffffff'
          context.fillRect(0, 0, canvas.width, canvas.height)
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL(format, quality))
      }
      image.onerror = () => reject(new Error('Invalid image'))
      image.src = reader.result
    }
    reader.onerror = () => reject(new Error('Unable to read image'))
    reader.readAsDataURL(file)
  })

const chooseImage = async (field, event) => {
  const [file] = event.target.files || []
  if (!file) return
  try {
    const isSignature = field === 'sellerSignature'
    form[field] = await resizeImage(file, {
      maxWidth: field === 'paymentQr' ? 500 : isSignature ? 900 : 700,
      maxHeight: isSignature ? 360 : Infinity,
      format:
        field === 'paymentQr' || isSignature ? 'image/png' : 'image/jpeg',
      preserveTransparency: isSignature,
    })
  } catch (imageError) {
    showToast(imageError.message, 'error')
  } finally {
    event.target.value = ''
  }
}

const removeAsset = async (asset) => {
  const confirmed = await requestConfirmation({
    title: `លុប ${asset.label}?`,
    message: 'រូបនេះនឹងត្រូវដកចេញនៅពេលអ្នករក្សាទុក Settings។',
    confirmLabel: 'លុបរូប',
    cancelLabel: 'បោះបង់',
    tone: 'danger',
  })
  if (confirmed) form[asset.key] = ''
}

const save = async (event) => {
  if (!(await validateForm(event?.currentTarget))) return

  saving.value = true
  error.value = ''
  try {
    form.phones = phoneText.value
      .split(',')
      .map((phone) => phone.trim())
      .filter(Boolean)
    form.invoiceFontSize = normalizeInvoiceFontSize(form.invoiceFontSize)
    form.invoicePaperSize = normalizeInvoicePaperSize(form.invoicePaperSize)
    Object.assign(form, (await settingsApi.update(form)).data)
    showToast('System settings saved')
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || 'Unable to save settings'
    showToast(error.value, 'error')
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <section class="container page-section system-settings-page">
    <div class="page-heading">
      <div>
        <span class="eyebrow">COMPANY CONFIGURATION</span>
        <h1>System Settings</h1>
        <p>កែព័ត៌មានក្រុមហ៊ុន Logo, ABA QR និងអក្សរលើវិក្កយបត្រ។</p>
      </div>
    </div>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>
    <ContentSkeleton v-if="loading" :cards="3" />

    <form v-else class="row g-4" novalidate @submit.prevent="save">
      <div class="col-12">
        <div class="settings-tabs" role="tablist" aria-label="System settings sections">
          <button
            v-for="tab in settingsTabs"
            :key="tab.key"
            class="settings-tab"
            :class="{ active: activeTab === tab.key }"
            type="button"
            role="tab"
            :aria-selected="activeTab === tab.key"
            @click="activeTab = tab.key"
          >
            <i class="bi" :class="tab.icon"></i>
            <span>{{ tab.label }}</span>
          </button>
        </div>
      </div>

      <div class="col-xl-8">
        <div v-show="activeTab === 'company'" class="content-card form-card mb-4">
          <div class="section-title">
            <span class="section-number">01</span>
            <div>
              <h2>Company Information</h2>
              <p>ព័ត៌មាននេះនឹងបង្ហាញលើ Invoice និង Payment Receipt។</p>
            </div>
          </div>
          <div class="row g-3">
            <div class="col-md-6">
              <label class="form-label">Company Name *</label>
              <input
                v-model.trim="form.companyName"
                class="form-control"
                minlength="2"
                maxlength="120"
                required
              />
              <small class="form-hint">Required. This appears on every invoice header.</small>
            </div>
            <div class="col-md-6">
              <label class="form-label">ឈ្មោះក្រុមហ៊ុន</label>
              <input v-model="form.companyNameKh" class="form-control" />
            </div>
            <div class="col-12">
              <label class="form-label">Address</label>
              <textarea v-model="form.address" class="form-control" rows="2"></textarea>
            </div>
            <div class="col-md-6">
              <label class="form-label">Telegram</label>
              <input v-model="form.telegram" class="form-control" />
            </div>
            <div class="col-md-6">
              <label class="form-label">Phones (comma separated)</label>
              <input v-model="phoneText" class="form-control" />
            </div>
            <div class="col-12">
              <label class="form-label">Payment Account</label>
              <input v-model="form.paymentAccount" class="form-control" />
            </div>
          </div>
        </div>

        <div v-show="activeTab === 'invoice'" class="content-card form-card mb-4">
          <div class="section-title">
            <span class="section-number">02</span>
            <div>
              <h2>Invoice Layout & Text</h2>
              <p>កំណត់ទំហំក្រដាស Font ចំណាំ និងអក្សរខាងក្រោមវិក្កយបត្រ។</p>
            </div>
          </div>
          <div class="row g-3">
            <div class="col-md-5">
              <label class="form-label">Invoice Paper Size</label>
              <select v-model="form.invoicePaperSize" class="form-select">
                <option value="a5">A5 - half page / compact</option>
                <option value="a4">A4 - full page</option>
              </select>
              <div class="form-text">A5 is best for compact shop invoices.</div>
            </div>
            <div class="col-md-7">
              <label class="form-label d-flex align-items-center justify-content-between gap-3">
                <span>Invoice Font Size</span>
                <strong>{{ form.invoiceFontSize }}px</strong>
              </label>
              <input
                v-model.number="form.invoiceFontSize"
                class="form-range invoice-font-range"
                type="range"
                :min="fontSizeMin"
                :max="fontSizeMax"
                step="0.5"
              />
              <div class="font-size-helper">
                <span>Small</span>
                <span>Large</span>
              </div>
            </div>
            <div class="col-md-5">
              <label class="form-label">Font Size Number</label>
              <div class="input-group">
                <input
                  v-model.number="form.invoiceFontSize"
                  class="form-control"
                  type="number"
                  :min="fontSizeMin"
                  :max="fontSizeMax"
                  step="0.5"
                  required
                />
                <span class="input-group-text">px</span>
              </div>
              <div class="form-text">Use 13px as the normal invoice size.</div>
            </div>
            <div class="col-md-7">
              <div class="settings-paper-summary">
                <i class="bi bi-printer"></i>
                <span>
                  <strong>{{ form.invoicePaperSize.toUpperCase() }} Print Layout</strong>
                  <small>
                    {{
                      form.invoicePaperSize === 'a5'
                        ? 'Compact shop invoice. Best for half-page printing.'
                        : 'Full-page invoice. Best when you need more breathing room.'
                    }}
                  </small>
                </span>
              </div>
            </div>
            <div class="col-12">
              <label class="form-label">Default Invoice Notes</label>
              <textarea v-model="form.invoiceNotes" class="form-control" rows="4"></textarea>
            </div>
            <div class="col-md-6">
              <label class="form-label">English Footer</label>
              <input v-model="form.footerEn" class="form-control" />
            </div>
            <div class="col-md-6">
              <label class="form-label">Khmer Footer</label>
              <input v-model="form.footerKh" class="form-control" />
            </div>
          </div>
        </div>

        <div v-show="activeTab === 'assets'" class="content-card form-card mb-4">
          <div class="section-title">
            <span class="section-number">03</span>
            <div>
              <h2>Brand Assets</h2>
              <p>Upload logo, JOTUN logo, ABA QR និង seller signature។</p>
            </div>
          </div>

          <div class="settings-assets-grid">
            <div
              v-for="asset in assetList"
              :key="asset.key"
              class="settings-asset"
            >
              <label class="form-label">{{ asset.label }}</label>
              <div class="settings-asset-preview">
                <img v-if="form[asset.key]" :src="form[asset.key]" :alt="asset.label" />
                <i v-else class="bi bi-image"></i>
              </div>
              <div class="d-flex gap-2">
                <label class="btn btn-outline-primary btn-sm mb-0">
                  Upload
                  <input
                    class="visually-hidden"
                    type="file"
                    accept="image/*"
                    @change="chooseImage(asset.key, $event)"
                  />
                </label>
                <button
                  v-if="form[asset.key]"
                  class="btn btn-outline-danger btn-sm"
                  type="button"
                  @click="removeAsset(asset)"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="col-xl-4">
        <div class="content-card form-card settings-preview-card">
          <div class="section-title compact-title">
            <span class="section-number">04</span>
            <div>
              <h2>Print Preview</h2>
              <p>Preview តូចសម្រាប់ Paper និង Font setting។</p>
            </div>
          </div>
          <div class="settings-invoice-preview-shell">
            <div
              class="settings-invoice-preview"
              :class="previewPaperClass"
              :style="previewStyle"
            >
              <header>
                <div class="mini-logo">
                  <img v-if="form.logo" :src="form.logo" alt="Marvel" />
                  <i v-else class="bi bi-building"></i>
                </div>
                <div>
                  <strong>{{ form.companyNameKh || form.companyName || 'Company' }}</strong>
                  <span>{{ form.companyName || 'Marvel Decor & JOTUN' }}</span>
                  <small>{{ form.telegram || 'Telegram' }}</small>
                </div>
                <div class="mini-jotun">
                  <img v-if="form.jotunLogo" :src="form.jotunLogo" alt="JOTUN" />
                  <span v-else>JOTUN</span>
                </div>
              </header>
              <h3>វិក្កយបត្រ / INVOICE</h3>
              <div class="mini-lines">
                <span></span><span></span><span></span>
              </div>
              <table>
                <thead>
                  <tr><th>Item</th><th>Qty</th><th>Amount</th></tr>
                </thead>
                <tbody>
                  <tr><td>JOTUN Paint</td><td>2</td><td>$400</td></tr>
                  <tr><td>Tools</td><td>1</td><td>$15</td></tr>
                </tbody>
              </table>
              <footer>
                <span>{{ form.footerEn || 'Thank you for support !' }}</span>
                <strong>{{ form.invoicePaperSize.toUpperCase() }}</strong>
              </footer>
            </div>
          </div>
          <div class="settings-preview-meta">
            <span><i class="bi bi-file-earmark"></i> {{ form.invoicePaperSize.toUpperCase() }}</span>
            <span><i class="bi bi-fonts"></i> {{ form.invoiceFontSize }}px</span>
          </div>
        </div>

        <button
          class="btn btn-brand btn-lg settings-save-button"
          :disabled="saving"
        >
          <i class="bi bi-check2-circle me-1"></i>
          {{ saving ? 'Saving...' : 'Save System Settings' }}
        </button>
      </div>
    </form>
  </section>
</template>
