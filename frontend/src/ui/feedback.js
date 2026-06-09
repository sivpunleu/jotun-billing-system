import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

export const showToast = (message, type = 'success') =>
  Swal.fire({
    toast: true,
    position: 'top-end',
    icon: type === 'error' ? 'error' : type,
    title: message,
    showConfirmButton: false,
    timer: 3500,
    timerProgressBar: true,
    customClass: {
      popup: 'billing-swal-toast',
    },
  })

export const requestConfirmation = async (options = {}) => {
  const input = options.inputType
    ? options.inputType === 'password'
      ? 'password'
      : 'text'
    : undefined

  const result = await Swal.fire({
    title: options.title || 'Confirm action',
    text: options.message || '',
    icon: options.tone === 'danger' ? 'warning' : 'question',
    input,
    inputLabel: options.inputLabel || undefined,
    inputPlaceholder: options.inputPlaceholder || undefined,
    inputAttributes: options.inputMinLength
      ? { minlength: String(options.inputMinLength) }
      : undefined,
    inputValidator: options.inputMinLength
      ? (value = '') =>
          value.length < options.inputMinLength
            ? `Minimum ${options.inputMinLength} characters`
            : undefined
      : undefined,
    showCancelButton: true,
    confirmButtonText: options.confirmLabel || 'Confirm',
    cancelButtonText: options.cancelLabel || 'Cancel',
    buttonsStyling: false,
    reverseButtons: true,
    focusCancel: !input,
    customClass: {
      popup: 'billing-swal-popup',
      actions: 'billing-swal-actions',
      confirmButton:
        options.tone === 'danger'
          ? 'btn btn-danger px-4'
          : 'btn btn-primary px-4',
      cancelButton: 'btn btn-light px-4',
    },
  })

  if (!result.isConfirmed) return false
  return input ? result.value : true
}

export const requestStockMovement = async (product) => {
  const recentMovements = (product.stockMovements || [])
    .slice(-5)
    .reverse()
    .map(
      (movement) => `
        <div class="stock-history-row">
          <span>${escapeHtml(movement.type)}</span>
          <strong>${Number(movement.quantity || 0)} ${escapeHtml(product.unit || '')}</strong>
          <small>${escapeHtml(movement.note || movement.recordedBy || '')}</small>
        </div>
      `,
    )
    .join('')

  const result = await Swal.fire({
    title: `Stock: ${product.name}`,
    html: `
      <div class="stock-swal-current">
        Current stock: <strong>${Number(product.stockQuantity || 0)} ${product.unit || ''}</strong>
      </div>
      <label class="stock-swal-label" for="stock-movement-type">Movement</label>
      <select id="stock-movement-type" class="swal2-select stock-swal-select">
        <option value="in">Stock In</option>
        <option value="out">Stock Out</option>
        <option value="set">Set Exact Stock</option>
      </select>
      <label class="stock-swal-label" for="stock-movement-quantity">Quantity</label>
      <input id="stock-movement-quantity" class="swal2-input stock-swal-input" type="number" min="0" step="0.01" placeholder="0">
      <label class="stock-swal-label" for="stock-movement-note">Note</label>
      <input id="stock-movement-note" class="swal2-input stock-swal-input" type="text" placeholder="Purchase, damaged, adjustment...">
      ${
        recentMovements
          ? `<div class="stock-history"><b>Recent movements</b>${recentMovements}</div>`
          : ''
      }
    `,
    showCancelButton: true,
    confirmButtonText: 'Save Movement',
    cancelButtonText: 'Cancel',
    buttonsStyling: false,
    customClass: {
      popup: 'billing-swal-popup',
      actions: 'billing-swal-actions',
      confirmButton: 'btn btn-danger px-4',
      cancelButton: 'btn btn-light px-4',
    },
    preConfirm: () => {
      const type = document.querySelector('#stock-movement-type')?.value
      const quantity = Number(
        document.querySelector('#stock-movement-quantity')?.value,
      )
      const note =
        document.querySelector('#stock-movement-note')?.value?.trim() || ''
      if (!Number.isFinite(quantity) || quantity < 0) {
        Swal.showValidationMessage('Enter a valid stock quantity')
        return false
      }
      if (type !== 'set' && quantity <= 0) {
        Swal.showValidationMessage('Quantity must be greater than zero')
        return false
      }
      if (type === 'out' && quantity > Number(product.stockQuantity || 0)) {
        Swal.showValidationMessage('Stock out exceeds current stock')
        return false
      }
      return { type, quantity, note }
    },
  })

  return result.isConfirmed ? result.value : false
}
