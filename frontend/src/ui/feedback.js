import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'

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
