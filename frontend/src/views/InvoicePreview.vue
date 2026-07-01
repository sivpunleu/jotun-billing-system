<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { insightApi, invoiceApi, settingsApi } from '../api/invoices'
import {
  canManageBilling,
  currentAdmin,
  isAuthenticated,
} from '../auth/session'
import ContentSkeleton from '../components/ContentSkeleton.vue'
import { formatDate, formatMoney, toDateInput } from '../utils/invoice'
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
const invoice = ref(null)
const loading = ref(true)
const error = ref('')
const recordingPayment = ref(false)
const sendingTelegram = ref('')
const updatingShareLink = ref(false)
const savingImage = ref(false)
const invoicePaperRef = ref(null)
const shareLinkDays = ref(30)
const telegramConfigured = ref(false)
const paymentForm = reactive({
  amount: 0,
  paidAt: toDateInput(),
  receivedBy:
    currentAdmin.value?.displayName || currentAdmin.value?.username || '',
  note: '',
})
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

const printInvoice = () => window.print()

const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })

const copyComputedStyles = (sourceNode, cloneNode) => {
  if (
    sourceNode.nodeType !== Node.ELEMENT_NODE ||
    cloneNode.nodeType !== Node.ELEMENT_NODE
  ) {
    return
  }

  const computedStyle = window.getComputedStyle(sourceNode)
  Array.from(computedStyle).forEach((property) => {
    cloneNode.style.setProperty(
      property,
      computedStyle.getPropertyValue(property),
      computedStyle.getPropertyPriority(property),
    )
  })

  Array.from(sourceNode.children).forEach((child, index) => {
    if (cloneNode.children[index]) {
      copyComputedStyles(child, cloneNode.children[index])
    }
  })
}

const inlineCloneImages = async (source, clone) => {
  const sourceImages = Array.from(source.querySelectorAll('img'))
  const cloneImages = Array.from(clone.querySelectorAll('img'))

  await Promise.all(
    cloneImages.map(async (image, index) => {
      const original = sourceImages[index]
      const sourceUrl =
        original?.currentSrc || original?.src || image.getAttribute('src')

      if (!sourceUrl || sourceUrl.startsWith('data:')) {
        if (sourceUrl) image.setAttribute('src', sourceUrl)
        return
      }

      try {
        const response = await fetch(sourceUrl, { cache: 'force-cache' })
        if (!response.ok) throw new Error('Image fetch failed')
        const dataUrl = await blobToDataUrl(await response.blob())
        image.setAttribute('src', dataUrl)
      } catch {
        image.setAttribute('src', sourceUrl)
      }
    }),
  )
}

const waitForInvoiceAssets = async (element) => {
  if (document.fonts?.ready) {
    await document.fonts.ready
  }

  const pendingImages = Array.from(element.querySelectorAll('img')).filter(
    (image) => !image.complete,
  )

  await Promise.all(
    pendingImages.map(
      (image) =>
        new Promise((resolve) => {
          image.onload = resolve
          image.onerror = resolve
        }),
    ),
  )
}

const saveInvoiceImage = async () => {
  const source = invoicePaperRef.value
  if (!source || !invoice.value) return

  savingImage.value = true
  try {
    await waitForInvoiceAssets(source)

    const rect = source.getBoundingClientRect()
    const width = Math.ceil(rect.width)
    const height = Math.ceil(rect.height)
    const clone = source.cloneNode(true)
    clone.classList.add('invoice-image-export')
    copyComputedStyles(source, clone)
    clone.style.width = `${width}px`
    clone.style.minHeight = `${height}px`
    clone.style.margin = '0'
    clone.style.boxShadow = 'none'

    await inlineCloneImages(source, clone)

    const serializedInvoice = new XMLSerializer().serializeToString(clone)
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <foreignObject width="100%" height="100%">
          <div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;min-height:${height}px;background:#fff;">
            ${serializedInvoice}
          </div>
        </foreignObject>
      </svg>
    `
    const svgBlob = new Blob([svg], {
      type: 'image/svg+xml;charset=utf-8',
    })
    const svgUrl = URL.createObjectURL(svgBlob)
    const image = new Image()

    await new Promise((resolve, reject) => {
      image.onload = resolve
      image.onerror = reject
      image.src = svgUrl
    })

    const scale = Math.max(2, Math.min(window.devicePixelRatio || 2, 3))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)
    const context = canvas.getContext('2d')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    URL.revokeObjectURL(svgUrl)

    const pngBlob = await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Unable to create image'))
      }, 'image/png')
    })

    const downloadUrl = URL.createObjectURL(pngBlob)
    const link = document.createElement('a')
    link.href = downloadUrl
    link.download = `${invoice.value.invoiceNumber || 'invoice'}.png`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(downloadUrl)
    showToast('Invoice image saved')
  } catch (exportError) {
    console.error('Unable to save invoice image', exportError)
    showToast('Unable to save invoice image', 'error')
  } finally {
    savingImage.value = false
  }
}

const formatInvoiceDate = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  const day = String(date.getDate()).padStart(2, '0')
  const month = date.toLocaleString('en-US', { month: 'short' })
  return `${day}-${month}-${date.getFullYear()}`
}

const money = (value) => formatMoney(value).replace('$', '').trim()

const totalBeforeDeposit = (data) =>
  Number(data.grandTotal ?? data.subtotal ?? 0)

const depositAmount = (data) =>
  Number(
    data.depositAmount ??
      totalBeforeDeposit(data) * (Number(data.depositRate || 0) / 100),
  )

const balanceDue = (data) =>
  Number(data.balanceDue ?? totalBeforeDeposit(data) - depositAmount(data))

const paidAmount = (data) =>
  Math.max(
    Number(data.paidAmount || 0),
    Math.max(0, totalBeforeDeposit(data) - balanceDue(data)),
  )

const resolvedStatus = computed(() => {
  if (!invoice.value) return 'unpaid'
  if (invoice.value.status) return invoice.value.status
  return invoice.value.paymentStatus === 'partial'
    ? 'partially_paid'
    : invoice.value.paymentStatus || 'unpaid'
})

const statusLabels = {
  draft: 'Draft',
  unpaid: 'Unpaid',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
  cancelled: 'Cancelled',
}

const isPublicPreview = computed(
  () => route.name === 'public-invoice-preview',
)
const showAdminControls = computed(
  () => !isPublicPreview.value && isAuthenticated.value,
)
const showManageControls = computed(
  () => showAdminControls.value && canManageBilling.value,
)
const shareLinkActive = computed(() => {
  if (!invoice.value?.shareToken || invoice.value.shareTokenRevokedAt) {
    return false
  }
  const expiresAt = new Date(invoice.value.shareTokenExpiresAt)
  return Number.isFinite(expiresAt.getTime()) && expiresAt > new Date()
})
const publicInvoiceLink = computed(() =>
  shareLinkActive.value
    ? `${window.location.origin}/public/invoices/${encodeURIComponent(
        invoice.value.shareToken,
      )}`
    : '',
)
const shareLinkStatus = computed(() => {
  if (invoice.value?.shareTokenRevokedAt) return 'Revoked'
  return shareLinkActive.value ? 'Active' : 'Expired'
})

const copyPublicLink = async () => {
  if (!publicInvoiceLink.value) return
  try {
    await navigator.clipboard.writeText(publicInvoiceLink.value)
    showToast('Public invoice link copied')
  } catch {
    showToast('Unable to copy public invoice link', 'error')
  }
}

const regenerateShareLink = async () => {
  const confirmed = await requestConfirmation({
    title: 'Regenerate public link?',
    message: shareLinkActive.value
      ? 'The current public invoice link will stop working immediately.'
      : `Create a new public link valid for ${shareLinkDays.value} days?`,
    confirmLabel: 'Regenerate',
    cancelLabel: 'Cancel',
    tone: 'danger',
  })
  if (!confirmed) return

  updatingShareLink.value = true
  try {
    const { data } = await invoiceApi.regenerateShareLink(
      invoice.value._id,
      shareLinkDays.value,
    )
    invoice.value = data
    showToast('Public invoice link regenerated')
  } catch (requestError) {
    showToast(
      requestError.response?.data?.message ||
        'Unable to regenerate public invoice link',
      'error',
    )
  } finally {
    updatingShareLink.value = false
  }
}

const revokeShareLink = async () => {
  const confirmed = await requestConfirmation({
    title: 'Revoke public link?',
    message: 'Anyone using the current link will no longer see this invoice.',
    confirmLabel: 'Revoke',
    cancelLabel: 'Cancel',
    tone: 'danger',
  })
  if (!confirmed) return

  updatingShareLink.value = true
  try {
    const { data } = await invoiceApi.revokeShareLink(invoice.value._id)
    invoice.value = data
    showToast('Public invoice link revoked')
  } catch (requestError) {
    showToast(
      requestError.response?.data?.message ||
        'Unable to revoke public invoice link',
      'error',
    )
  } finally {
    updatingShareLink.value = false
  }
}

const loadInvoice = async () => {
  try {
    const response = isPublicPreview.value
      ? await invoiceApi.getPublic(route.params.token)
      : await invoiceApi.get(route.params.id)
    invoice.value = response.data
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || 'មិនអាចទាញយកវិក្កយបត្របានទេ'
  } finally {
    loading.value = false
  }
}

const deleteInvoice = async () => {
  const confirmed = await requestConfirmation({
    title: 'លុបវិក្កយបត្រ?',
    message: `វិក្កយបត្រ ${invoice.value.invoiceNumber} នឹងត្រូវផ្លាស់ទីទៅធុងសំរាម។`,
    confirmLabel: 'លុប',
    cancelLabel: 'បោះបង់',
    tone: 'danger',
  })
  if (!confirmed) return

  try {
    await invoiceApi.remove(invoice.value._id)
    showToast('វិក្កយបត្រត្រូវបានផ្លាស់ទីទៅធុងសំរាម')
    router.push('/invoices')
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || 'មិនអាចលុបវិក្កយបត្របានទេ'
    showToast(error.value, 'error')
  }
}

const loadSettings = async () => {
  try {
    Object.assign(companySettings, (await settingsApi.get()).data)
  } catch {
    // Keep local fallback branding if settings cannot be loaded.
  }
}

const loadTelegramStatus = async () => {
  if (!showAdminControls.value) return
  try {
    telegramConfigured.value = (
      await insightApi.telegramStatus()
    ).data.configured
  } catch {
    telegramConfigured.value = false
  }
}

const sendInvoiceTelegram = async () => {
  sendingTelegram.value = 'invoice'
  try {
    await invoiceApi.sendTelegram(invoice.value._id)
    showToast('ផ្ញើវិក្កយបត្រទៅ Telegram បានជោគជ័យ')
  } catch (requestError) {
    showToast(
      requestError.response?.data?.message ||
        'មិនអាចផ្ញើវិក្កយបត្រទៅ Telegram បានទេ',
      'error',
    )
  } finally {
    sendingTelegram.value = ''
  }
}

const sendReceiptTelegram = async (payment) => {
  sendingTelegram.value = String(payment._id)
  try {
    await invoiceApi.sendPaymentTelegram(invoice.value._id, payment._id)
    showToast('ផ្ញើបង្កាន់ដៃទៅ Telegram បានជោគជ័យ')
  } catch (requestError) {
    showToast(
      requestError.response?.data?.message ||
        'មិនអាចផ្ញើបង្កាន់ដៃទៅ Telegram បានទេ',
      'error',
    )
  } finally {
    sendingTelegram.value = ''
  }
}

const addPayment = async (event) => {
  if (!(await validateForm(event?.currentTarget))) return

  recordingPayment.value = true
  error.value = ''
  try {
    const response = await invoiceApi.addPayment(invoice.value._id, paymentForm)
    invoice.value = response.data
    showToast('កត់ត្រាការបង់ប្រាក់បានជោគជ័យ')
    Object.assign(paymentForm, {
      amount: 0,
      paidAt: toDateInput(),
      receivedBy:
        currentAdmin.value?.displayName || currentAdmin.value?.username || '',
      note: '',
    })
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || 'មិនអាចកត់ត្រាការបង់ប្រាក់បានទេ'
    showToast(error.value, 'error')
  } finally {
    recordingPayment.value = false
  }
}

onMounted(() => {
  loadInvoice()
  loadSettings()
  loadTelegramStatus()
})
</script>

<template>
  <section class="container page-section preview-page">
    <div class="preview-actions d-print-none">
      <RouterLink
        v-if="showAdminControls"
        class="btn btn-outline-secondary"
        to="/invoices"
      >
        <i class="bi bi-arrow-left me-1"></i>
        បញ្ជីវិក្កយបត្រ
      </RouterLink>
      <span v-else></span>
      <div class="d-flex flex-wrap gap-2">
        <RouterLink
          v-if="invoice && showManageControls"
          class="btn btn-outline-primary"
          :to="{ name: 'invoice-edit', params: { id: invoice._id } }"
        >
          <i class="bi bi-pencil me-1"></i>
          កែប្រែ
        </RouterLink>
        <RouterLink
          v-if="invoice && showManageControls"
          class="btn btn-outline-secondary"
          :to="{
            name: 'invoice-create',
            query: { duplicate: invoice._id },
          }"
        >
          <i class="bi bi-copy me-1"></i>
          ចម្លងវិក្កយបត្រ
        </RouterLink>
        <button
          v-if="invoice && showManageControls"
          class="btn btn-outline-info telegram-action"
          type="button"
          :disabled="Boolean(sendingTelegram) || !telegramConfigured"
          :title="
            telegramConfigured
              ? 'ផ្ញើវិក្កយបត្រទៅ Telegram'
              : 'Telegram Bot មិនទាន់បានកំណត់នៅ Server'
          "
          @click="sendInvoiceTelegram"
        >
          <span
            v-if="sendingTelegram === 'invoice'"
            class="spinner-border spinner-border-sm me-1"
          ></span>
          <i v-else class="bi bi-telegram me-1"></i>
          Telegram
        </button>
        <button
          v-if="invoice && showManageControls"
          class="btn btn-outline-danger"
          type="button"
          @click="deleteInvoice"
        >
          <i class="bi bi-trash3 me-1"></i>
          លុប
        </button>
        <button
          v-if="invoice"
          class="btn btn-outline-primary"
          type="button"
          :disabled="savingImage"
          @click="saveInvoiceImage"
        >
          <span
            v-if="savingImage"
            class="spinner-border spinner-border-sm me-1"
          ></span>
          <i v-else class="bi bi-file-earmark-image me-1"></i>
          Save Image
        </button>
        <button
          v-if="invoice"
          class="btn btn-brand"
          type="button"
          @click="printInvoice"
        >
          <i class="bi bi-printer me-1"></i>
          Print / Save PDF
        </button>
      </div>
    </div>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>
    <ContentSkeleton v-if="loading" :cards="2" />

    <div
      v-if="invoice && showAdminControls"
      class="share-link-management d-print-none"
    >
      <div class="content-card form-card">
        <div class="share-link-heading">
          <div>
            <span
              class="status-pill"
              :class="shareLinkActive ? 'status-paid' : 'status-cancelled'"
            >
              {{ shareLinkStatus }}
            </span>
            <h2>Public Invoice Link</h2>
            <p v-if="shareLinkActive">
              Expires {{ new Date(invoice.shareTokenExpiresAt).toLocaleString() }}
            </p>
            <p v-else>
              Regenerate a link before sharing this invoice with a customer.
            </p>
          </div>
          <div v-if="showManageControls" class="share-link-duration">
            <label class="form-label mb-1" for="shareLinkDays">
              Link duration
            </label>
            <select
              id="shareLinkDays"
              v-model.number="shareLinkDays"
              class="form-select form-select-sm"
              :disabled="updatingShareLink"
            >
              <option :value="7">7 days</option>
              <option :value="30">30 days</option>
              <option :value="90">90 days</option>
              <option :value="365">1 year</option>
            </select>
          </div>
        </div>

        <div class="share-link-controls">
          <input
            class="form-control"
            type="text"
            :value="publicInvoiceLink || 'Public link is unavailable'"
            readonly
          />
          <button
            class="btn btn-outline-primary"
            type="button"
            :disabled="!shareLinkActive || updatingShareLink"
            @click="copyPublicLink"
          >
            <i class="bi bi-clipboard me-1"></i>
            Copy
          </button>
          <button
            v-if="showManageControls"
            class="btn btn-outline-secondary"
            type="button"
            :disabled="updatingShareLink"
            @click="regenerateShareLink"
          >
            <span
              v-if="updatingShareLink"
              class="spinner-border spinner-border-sm me-1"
            ></span>
            <i v-else class="bi bi-arrow-repeat me-1"></i>
            Regenerate
          </button>
          <button
            v-if="showManageControls && shareLinkActive"
            class="btn btn-outline-danger"
            type="button"
            :disabled="updatingShareLink"
            @click="revokeShareLink"
          >
            <i class="bi bi-link-45deg me-1"></i>
            Revoke
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="invoice && showAdminControls"
      class="payment-management d-print-none"
    >
      <div class="content-card form-card">
        <div class="payment-management-heading">
          <div>
            <span
              class="status-pill"
              :class="`status-${resolvedStatus}`"
            >
              {{ statusLabels[resolvedStatus] }}
            </span>
            <h2>Payment History</h2>
            <p>
              បានបង់ {{ formatMoney(paidAmount(invoice)) }} · នៅសល់
              {{ formatMoney(invoice.balanceDue) }}
            </p>
          </div>
        </div>

        <form
          v-if="
            showManageControls &&
            !['draft', 'cancelled', 'paid'].includes(resolvedStatus)
          "
          class="row g-3 payment-form"
          novalidate
          @submit.prevent="addPayment"
        >
          <div class="col-md-3">
            <label class="form-label">ចំនួនប្រាក់ *</label>
            <div class="input-group">
              <span class="input-group-text">$</span>
              <input
                v-model.number="paymentForm.amount"
                class="form-control"
                type="number"
                min="0.01"
                :max="invoice.balanceDue"
                step="0.01"
                required
              />
            </div>
          </div>
          <div class="col-md-3">
            <label class="form-label">ថ្ងៃបង់ *</label>
            <input
              v-model="paymentForm.paidAt"
              class="form-control"
              type="date"
              required
            />
          </div>
          <div class="col-md-3">
            <label class="form-label">អ្នកទទួល *</label>
            <input
              v-model.trim="paymentForm.receivedBy"
              class="form-control"
              required
            />
          </div>
          <div class="col-md-3">
            <label class="form-label">កំណត់ចំណាំ</label>
            <input v-model.trim="paymentForm.note" class="form-control" />
          </div>
          <div class="col-12">
            <button
              class="btn btn-success"
              type="submit"
              :disabled="recordingPayment"
            >
              <i class="bi bi-cash-coin me-1"></i>
              {{ recordingPayment ? 'កំពុងកត់ត្រា...' : 'កត់ត្រាការបង់ប្រាក់' }}
            </button>
          </div>
        </form>

        <div v-if="invoice.payments?.length" class="table-responsive mt-4">
          <table class="table table-sm payment-table responsive-table mb-0">
            <thead>
              <tr>
                <th>ថ្ងៃបង់</th>
                <th>អ្នកទទួល</th>
                <th>កំណត់ចំណាំ</th>
                <th class="text-end">ចំនួន</th>
                <th class="text-end">Receipt</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="payment in invoice.payments" :key="payment._id">
                <td class="mobile-card-primary" data-label="ថ្ងៃបង់">{{ formatDate(payment.paidAt) }}</td>
                <td data-label="អ្នកទទួល">{{ payment.receivedBy }}</td>
                <td data-label="កំណត់ចំណាំ">{{ payment.note || '-' }}</td>
                <td class="text-end fw-bold" data-label="ចំនួន">{{ formatMoney(payment.amount) }}</td>
                <td class="text-end" data-label="Receipt">
                  <div class="d-inline-flex gap-1">
                    <RouterLink
                      class="btn btn-sm btn-outline-primary"
                      :to="{
                        name: 'payment-receipt',
                        params: {
                          id: invoice._id,
                          paymentId: payment._id,
                        },
                      }"
                    >
                      <i class="bi bi-printer"></i>
                    </RouterLink>
                    <button
                      v-if="showManageControls"
                      class="btn btn-sm btn-outline-info telegram-action"
                      type="button"
                      :disabled="
                        Boolean(sendingTelegram) || !telegramConfigured
                      "
                      title="ផ្ញើបង្កាន់ដៃទៅ Telegram"
                      @click="sendReceiptTelegram(payment)"
                    >
                      <span
                        v-if="sendingTelegram === String(payment._id)"
                        class="spinner-border spinner-border-sm"
                      ></span>
                      <i v-else class="bi bi-telegram"></i>
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="text-secondary mb-0 mt-3">
          មិនទាន់មានការបង់ប្រាក់បន្ថែម។
        </p>
      </div>
    </div>

    <div v-if="invoice" class="invoice-scroll-frame">
      <article
        ref="invoicePaperRef"
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
            <span>{{ invoice.customer.name }}</span>
          </div>
          <div class="invoice-info-row">
            <strong>លេខទូរស័ព្ទ | Phone:</strong>
            <span>{{ invoice.customer.phone || '-' }}</span>
          </div>
          <div class="invoice-info-row">
            <strong>អាសយដ្ឋាន | Address:</strong>
            <span>{{ invoice.customer.address || '-' }}</span>
          </div>
        </div>
        <div class="classic-meta">
          <div class="invoice-info-row">
            <strong>កាលបរិច្ឆេទ | Date:</strong>
            <span>{{ formatInvoiceDate(invoice.invoiceDate) }}</span>
          </div>
          <div class="invoice-info-row">
            <strong>វិក្កយបត្រ | Invoice No:</strong>
            <span>{{ invoice.invoiceNumber }}</span>
          </div>
          <div class="invoice-info-row">
            <strong>ប្រភពលក់ | Sold By:</strong>
            <span>
              {{
                invoice.salesChannel === 'salesperson'
                  ? invoice.salesperson?.name || '-'
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
          <tr v-for="(item, index) in invoice.items" :key="item._id || index">
            <td class="text-center">{{ index + 1 }}</td>
            <td>{{ item.description }}</td>
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
              <strong>{{ money(item.total) }}</strong>
            </td>
          </tr>
          <tr
            v-for="index in Math.max(0, 4 - invoice.items.length)"
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
            <p v-if="invoice.notes">{{ invoice.notes }}</p>
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
            <!-- <small>REN THEA R. &amp; KHIM C.</small> -->
          </div>
        </div>

        <table class="classic-totals">
          <tbody>
            <tr>
              <th>សរុប<br /><span>Total Price</span></th>
              <td><span>$</span><strong>{{ money(invoice.subtotal) }}</strong></td>
            </tr>
            <tr v-if="Number(invoice.discount || 0) > 0">
              <th>បញ្ចុះតម្លៃ<br /><span>Discount</span></th>
              <td><span>$</span><strong>-{{ money(invoice.discount) }}</strong></td>
            </tr>
            <tr v-if="Number(invoice.taxAmount || 0) > 0">
              <th>ពន្ធ ({{ invoice.taxRate }}%)<br /><span>Tax</span></th>
              <td><span>$</span><strong>{{ money(invoice.taxAmount) }}</strong></td>
            </tr>
            <tr>
              <th>ថ្លៃដឹកជញ្ជូន<br /><span>Delivery Fee</span></th>
              <td><span>$</span><strong>{{ money(invoice.deliveryFee) }}</strong></td>
            </tr>
            <tr>
              <th>
                ប្រាក់កក់ ({{ invoice.depositRate || 0 }}%)<br />
                <span>Deposit ({{ invoice.depositRate || 0 }}%)</span>
              </th>
              <td><span>$</span><strong>{{ money(depositAmount(invoice)) }}</strong></td>
            </tr>
            <tr>
              <th>ប្រាក់នៅសល់<br /><span>Balance Due</span></th>
              <td><span>$</span><strong>{{ money(balanceDue(invoice)) }}</strong></td>
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
  </section>
</template>
