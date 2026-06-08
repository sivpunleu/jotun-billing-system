<script setup>
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { invoiceApi } from '../api/invoices'
import { formatMoney } from '../utils/invoice'
import logo from '../assets/logo-marvel.png'
import jotunLogo from '../assets/jotun.jpg'
import qrPlaceholder from '../assets/aba-qr-square.jpg'

const route = useRoute()
const router = useRouter()
const invoice = ref(null)
const loading = ref(true)
const error = ref('')

const printInvoice = () => window.print()

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

const loadInvoice = async () => {
  try {
    const response = await invoiceApi.get(route.params.id)
    invoice.value = response.data
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || 'មិនអាចទាញយកវិក្កយបត្របានទេ'
  } finally {
    loading.value = false
  }
}

const deleteInvoice = async () => {
  const confirmed = window.confirm(
    `តើអ្នកពិតជាចង់លុបវិក្កយបត្រ ${invoice.value.invoiceNumber} មែនទេ?`,
  )
  if (!confirmed) return

  try {
    await invoiceApi.remove(invoice.value._id)
    router.push('/invoices')
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || 'មិនអាចលុបវិក្កយបត្របានទេ'
  }
}

onMounted(loadInvoice)
</script>

<template>
  <section class="container page-section preview-page">
    <div class="preview-actions d-print-none">
      <RouterLink class="btn btn-outline-secondary" to="/invoices">
        <i class="bi bi-arrow-left me-1"></i>
        បញ្ជីវិក្កយបត្រ
      </RouterLink>
      <div class="d-flex flex-wrap gap-2">
        <RouterLink
          v-if="invoice"
          class="btn btn-outline-primary"
          :to="{ name: 'invoice-edit', params: { id: invoice._id } }"
        >
          <i class="bi bi-pencil me-1"></i>
          កែប្រែ
        </RouterLink>
        <button
          v-if="invoice"
          class="btn btn-outline-danger"
          type="button"
          @click="deleteInvoice"
        >
          <i class="bi bi-trash3 me-1"></i>
          លុប
        </button>
        <button
          v-if="invoice"
          class="btn btn-danger"
          type="button"
          @click="printInvoice"
        >
          <i class="bi bi-printer me-1"></i>
          ព្រីន / PDF
        </button>
      </div>
    </div>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>
    <div v-if="loading" class="loading-state content-card">
      <div class="spinner-border text-danger" role="status"></div>
      <span>កំពុងរៀបចំវិក្កយបត្រ...</span>
    </div>

    <article v-else-if="invoice" class="invoice-paper classic-invoice">
      <header class="classic-header">
        <div class="classic-brand-block">
          <img class="classic-logo" :src="logo" alt="Marvel Decor" />
          <div class="classic-brand-copy">
            <h5 class="classic-brand-title">ម៉ាវែល ដេគ័រ</h5>
            <h6 class="classic-subtitle">Marvel Decor</h6>
          </div>
        </div>
        <div class="company-copy">
          <h1>ម៉ាវែល ដេគ័រ &amp; JOTUN</h1>
          <p>មជ្ឈមណ្ឌលលាយថ្នាំពណ៍ចូតាន់ដោយកុំព្យូទ័រ
            ការិយាល័យលាយថ្នាំពណ៌ចូតាន់ បោះដុំ លក់រាយ ចែកចាយបន្ត</p>
          <p>អាស័យដ្ឋាន : ផ្ទះលេខ200 ផ្លូវឧកញ៉ាម៉ុងរិទ្ធី សង្កាត់ភ្នំពេញថ្មី ខណ្ឌសែនសុខ រាជធានីភ្នំពេញ</p>
          <p>Telegram : 068 8888 70</p>
          <p>លេខទូរស័ព្ទ | Phone: 098 689 883</p>
          <p>លេខទូរស័ព្ទ | Phone: 068 888 870</p>
        </div>
        <div class="classic-jotun-block">
          <img class="classic-jotun-logo" :src="jotunLogo" alt="Jotun" />
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
        </div>
      </section>

      <table class="classic-table">
        <thead>
          <tr>
            <th class="number-column">ល.រ<br />No.</th>
            <th>ឈ្មោះ និងបរិយាយទំនិញ<br />Item &amp; Description</th>
            <th class="code-column">លេខកូដ<br />Item code</th>
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
            v-for="index in Math.max(0, 5 - invoice.items.length)"
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
            <template v-else>
              <p>- ទំនិញទិញហើយមិនអាចប្តូរ ឬសងត្រឡប់វិញបានទេ</p>
              <p>- រាល់ការទូទាត់ត្រូវមានវិក្កយបត្រត្រឹមត្រូវ</p>
            </template>
          </div>
          <div class="qr-block">
            <p>ទូទាត់តាមរយៈ៖</p>
            <strong>ABA : 068 888 187</strong>
            <img :src="qrPlaceholder" alt="ABA payment QR placeholder" />
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
          <div class="signature-space seller-mark"></div>
          <div class="signature-line"></div>
          <p>ហត្ថលេខា និងឈ្មោះ អ្នកលក់</p>
          <span>Seller's Signature &amp; Name</span>
        </div>
      </section>

      <footer class="classic-footer">
        <span>Thank you for support !</span>
        <strong>សូមអរគុណចំពោះការគាំទ្រ !</strong>
      </footer>
    </article>
  </section>
</template>
