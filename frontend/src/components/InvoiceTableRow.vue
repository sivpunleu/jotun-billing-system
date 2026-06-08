<script setup>
import { formatDate, formatMoney } from '../utils/invoice'

defineProps({
  invoice: {
    type: Object,
    required: true,
  },
})

defineEmits(['delete'])

const statusLabels = {
  unpaid: 'មិនទាន់បង់',
  partial: 'បង់ខ្លះ',
  paid: 'បានបង់',
}
</script>

<template>
  <tr>
    <td>
      <RouterLink
        class="invoice-number"
        :to="{ name: 'invoice-preview', params: { id: invoice._id } }"
      >
        {{ invoice.invoiceNumber }}
      </RouterLink>
      <small class="d-block text-secondary">{{ formatDate(invoice.invoiceDate) }}</small>
    </td>
    <td>
      <strong>{{ invoice.customer?.name }}</strong>
      <small v-if="invoice.customer?.phone" class="d-block text-secondary">
        {{ invoice.customer.phone }}
      </small>
    </td>
    <td class="text-nowrap">{{ formatDate(invoice.dueDate) }}</td>
    <td>
      <span class="status-pill" :class="`status-${invoice.paymentStatus}`">
        {{ statusLabels[invoice.paymentStatus] }}
      </span>
    </td>
    <td class="text-end fw-bold">{{ formatMoney(invoice.grandTotal) }}</td>
    <td class="text-end text-nowrap">
      <RouterLink
        class="btn btn-sm btn-light action-button"
        :to="{ name: 'invoice-preview', params: { id: invoice._id } }"
        title="មើល"
      >
        <i class="bi bi-eye"></i>
      </RouterLink>
      <RouterLink
        class="btn btn-sm btn-light action-button"
        :to="{ name: 'invoice-edit', params: { id: invoice._id } }"
        title="កែប្រែ"
      >
        <i class="bi bi-pencil"></i>
      </RouterLink>
      <button
        class="btn btn-sm btn-light action-button text-danger"
        type="button"
        title="លុប"
        @click="$emit('delete', invoice)"
      >
        <i class="bi bi-trash3"></i>
      </button>
    </td>
  </tr>
</template>

