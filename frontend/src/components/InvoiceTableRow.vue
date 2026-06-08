<script setup>
import { computed } from 'vue'
import { formatDate, formatMoney } from '../utils/invoice'

const props = defineProps({
  invoice: {
    type: Object,
    required: true,
  },
  deleted: {
    type: Boolean,
    default: false,
  },
  canManage: {
    type: Boolean,
    default: false,
  },
})

defineEmits(['delete', 'restore'])

const resolvedStatus = computed(() => {
  if (props.invoice.status) return props.invoice.status
  if (props.invoice.paymentStatus === 'partial') return 'partially_paid'
  return props.invoice.paymentStatus || 'unpaid'
})

const statusLabels = {
  draft: 'Draft',
  unpaid: 'Unpaid',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
  cancelled: 'Cancelled',
}
</script>

<template>
  <tr>
    <td>
      <RouterLink
        v-if="!deleted"
        class="invoice-number"
        :to="{ name: 'invoice-preview', params: { id: invoice._id } }"
      >
        {{ invoice.invoiceNumber }}
      </RouterLink>
      <strong v-else>{{ invoice.invoiceNumber }}</strong>
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
      <span class="status-pill" :class="`status-${resolvedStatus}`">
        {{ statusLabels[resolvedStatus] || resolvedStatus }}
      </span>
    </td>
    <td class="text-end fw-bold">{{ formatMoney(invoice.grandTotal) }}</td>
    <td class="text-end">{{ formatMoney(invoice.balanceDue) }}</td>
    <td class="text-end text-nowrap">
      <button
        v-if="deleted && canManage"
        class="btn btn-sm btn-outline-success"
        type="button"
        @click="$emit('restore', invoice)"
      >
        <i class="bi bi-arrow-counterclockwise me-1"></i> Restore
      </button>
      <template v-else>
        <RouterLink
          class="btn btn-sm btn-light action-button"
          :to="{ name: 'invoice-preview', params: { id: invoice._id } }"
          title="មើល"
        >
          <i class="bi bi-eye"></i>
        </RouterLink>
        <RouterLink
          v-if="canManage"
          class="btn btn-sm btn-light action-button"
          :to="{ name: 'invoice-edit', params: { id: invoice._id } }"
          title="កែប្រែ"
        >
          <i class="bi bi-pencil"></i>
        </RouterLink>
        <button
          v-if="canManage"
          class="btn btn-sm btn-light action-button text-danger"
          type="button"
          title="លុប"
          @click="$emit('delete', invoice)"
        >
          <i class="bi bi-trash3"></i>
        </button>
      </template>
    </td>
  </tr>
</template>
