<script setup>
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { invoiceApi } from '../api/invoices'
import { formatDate, formatMoney } from '../utils/invoice'
import fallbackLogo from '../assets/logo-marvel.png'

const route = useRoute()
const receipt = ref(null)
const loading = ref(true)
const error = ref('')
const printReceipt = () => window.print()

onMounted(async () => {
  try {
    receipt.value = (
      await invoiceApi.paymentReceipt(
        route.params.id,
        route.params.paymentId,
      )
    ).data
  } catch (requestError) {
    error.value =
      requestError.response?.data?.message || 'Unable to load receipt'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <section class="container page-section receipt-page">
    <div class="preview-actions d-print-none">
      <RouterLink
        class="btn btn-outline-secondary"
        :to="`/invoices/${route.params.id}`"
      >
        <i class="bi bi-arrow-left me-1"></i> Invoice
      </RouterLink>
      <button class="btn btn-danger" type="button" @click="printReceipt">
        <i class="bi bi-printer me-1"></i> Print Receipt
      </button>
    </div>

    <div v-if="error" class="alert alert-danger">{{ error }}</div>
    <div v-if="loading" class="loading-state content-card">
      <div class="spinner-border text-danger"></div>
    </div>

    <article v-else-if="receipt" class="receipt-paper">
      <header class="receipt-header">
        <img :src="receipt.settings.logo || fallbackLogo" alt="Company logo" />
        <div>
          <h1>
            {{ receipt.settings.companyNameKh || receipt.settings.companyName }}
          </h1>
          <p>{{ receipt.settings.address }}</p>
          <p>
            Phone: {{ (receipt.settings.phones || []).join(' / ') }}
          </p>
        </div>
      </header>

      <div class="receipt-title">
        <span>បង្កាន់ដៃបង់ប្រាក់</span>
        <strong>PAYMENT RECEIPT</strong>
      </div>

      <div class="receipt-meta">
        <div>
          <span>Receipt No.</span>
          <strong>
            RCPT-{{ String(receipt.payment._id).slice(-8).toUpperCase() }}
          </strong>
        </div>
        <div>
          <span>Payment Date</span>
          <strong>{{ formatDate(receipt.payment.paidAt) }}</strong>
        </div>
        <div>
          <span>Invoice No.</span>
          <strong>{{ receipt.invoice.invoiceNumber }}</strong>
        </div>
        <div>
          <span>Received By</span>
          <strong>{{ receipt.payment.receivedBy }}</strong>
        </div>
        <div>
          <span>Sales Source</span>
          <strong>
            {{
              receipt.invoice.salesChannel === 'salesperson'
                ? receipt.invoice.salesperson?.name || 'Sale'
                : 'In-store'
            }}
          </strong>
        </div>
      </div>

      <section class="receipt-customer">
        <span>Received from</span>
        <h2>{{ receipt.invoice.customer?.name }}</h2>
        <p>
          {{ receipt.invoice.customer?.phone || '-' }} ·
          {{ receipt.invoice.customer?.address || '-' }}
        </p>
      </section>

      <div class="receipt-amount">
        <span>Amount Paid</span>
        <strong>{{ formatMoney(receipt.payment.amount) }}</strong>
      </div>

      <div class="receipt-details">
        <div>
          <span>Note</span>
          <strong>{{ receipt.payment.note || 'Invoice payment' }}</strong>
        </div>
        <div>
          <span>Remaining Balance</span>
          <strong>{{ formatMoney(receipt.balanceAfterPayment) }}</strong>
        </div>
      </div>

      <footer class="receipt-footer">
        <div>
          <span>Customer Signature</span>
        </div>
        <div>
          <span>Authorized Signature</span>
        </div>
      </footer>
      <p class="receipt-thanks">
        {{ receipt.settings.footerEn }} · {{ receipt.settings.footerKh }}
      </p>
    </article>
  </section>
</template>
