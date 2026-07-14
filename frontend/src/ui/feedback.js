import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'

const safeText = (value) => String(value ?? '')

const safeNumber = (value) => {
  const numericValue = Number(value)
  return Number.isFinite(numericValue) ? numericValue : 0
}

const stockMovementTypeClass = (type) => {
  const normalizedType = safeText(type).toLowerCase()
  return ['in', 'out', 'set'].includes(normalizedType)
    ? normalizedType
    : 'unknown'
}

const createTextElement = (tagName, className, text) => {
  const element = document.createElement(tagName)
  if (className) element.className = className
  element.textContent = safeText(text)
  return element
}

export const showToast = (message, type = 'success') =>
  Swal.fire({
    toast: true,
    position: 'top-end',
    icon: type === 'error' ? 'error' : type,
    titleText: safeText(message),
    showConfirmButton: false,
    timer: 3500,
    timerProgressBar: true,
    customClass: {
      popup: `billing-swal-toast billing-swal-toast-${type}`,
    },
  })

export const showSuccessAlert = (
  message,
  title = 'ជោគជ័យ',
  options = {},
) =>
  Swal.fire({
    icon: 'success',
    titleText: safeText(title),
    text: message,
    timer: options.timer ?? 1400,
    timerProgressBar: true,
    showConfirmButton: options.showConfirmButton ?? false,
    confirmButtonText: options.confirmLabel || 'យល់ព្រម',
    buttonsStyling: false,
    customClass: {
      popup: 'billing-swal-popup',
      confirmButton: 'btn btn-brand px-4',
    },
  })

const fieldLabel = (control) => {
  const label = control.labels?.[0]?.textContent
  return String(label || control.name || 'ទិន្នន័យនេះ')
    .replace('*', '')
    .trim()
}

const validationMessage = (control) => {
  const label = fieldLabel(control)
  const validity = control.validity

  if (validity.valueMissing) return `សូមបំពេញ "${label}"។`
  if (validity.tooShort) {
    return `"${label}" ត្រូវមានយ៉ាងតិច ${control.minLength} តួអក្សរ។`
  }
  if (validity.tooLong) {
    return `"${label}" មិនអាចលើស ${control.maxLength} តួអក្សរបានទេ។`
  }
  if (validity.rangeUnderflow) {
    return `"${label}" ត្រូវធំជាង ឬស្មើ ${control.min}។`
  }
  if (validity.rangeOverflow) {
    return `"${label}" មិនអាចលើស ${control.max} បានទេ។`
  }
  if (validity.stepMismatch || validity.badInput) {
    return `សូមបញ្ចូលតម្លៃត្រឹមត្រូវសម្រាប់ "${label}"។`
  }
  if (validity.typeMismatch || validity.patternMismatch) {
    return `ទម្រង់ "${label}" មិនត្រឹមត្រូវទេ។`
  }
  return control.validationMessage || `សូមពិនិត្យ "${label}" ម្តងទៀត។`
}

export const validateForm = async (
  formElement,
  { customMessage = '' } = {},
) => {
  formElement
    ?.querySelectorAll('.field-validation-message')
    .forEach((message) => message.remove())
  formElement
    ?.querySelectorAll('.is-invalid')
    .forEach((control) => {
      control.classList.remove('is-invalid')
      control.removeAttribute('aria-invalid')
    })

  const controls = formElement
    ? Array.from(formElement.elements || []).filter(
        (control) =>
          typeof control.checkValidity === 'function' &&
          !control.disabled &&
          !['button', 'submit', 'reset'].includes(control.type),
      )
    : []
  const invalidControl = controls.find((control) => !control.checkValidity())
  const message = invalidControl
    ? validationMessage(invalidControl)
    : customMessage

  if (!message) return true

  controls
    .filter((control) => !control.checkValidity())
    .forEach((control) => {
      control.classList.add('is-invalid')
      control.setAttribute('aria-invalid', 'true')
      const validation = document.createElement('small')
      validation.className = 'field-validation-message'
      validation.textContent = validationMessage(control)
      const anchor = control.closest('.input-group') || control
      anchor.insertAdjacentElement('afterend', validation)

      control.addEventListener(
        'input',
        () => {
          control.classList.remove('is-invalid')
          control.removeAttribute('aria-invalid')
          validation.remove()
        },
        { once: true },
      )
    })

  await Swal.fire({
    icon: 'warning',
    titleText: 'សូមពិនិត្យព័ត៌មាន',
    text: message,
    confirmButtonText: 'យល់ព្រម',
    buttonsStyling: false,
    customClass: {
      popup: 'billing-swal-popup',
      confirmButton: 'btn btn-brand px-4',
    },
  })

  invalidControl?.focus({ preventScroll: true })
  invalidControl?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  return false
}

export const requestConfirmation = async (options = {}) => {
  const input = options.inputType
    ? options.inputType === 'password'
      ? 'password'
      : 'text'
    : undefined

  const result = await Swal.fire({
    titleText: safeText(options.title || 'Confirm action'),
    text: options.message || '',
    icon: options.tone === 'danger' ? 'warning' : 'question',
    input,
    inputLabel: options.inputLabel || undefined,
    inputPlaceholder: options.inputPlaceholder || undefined,
    inputAttributes: options.inputMinLength
      ? { minlength: String(options.inputMinLength) }
      : undefined,
    inputValidator:
      options.inputValidator ||
      (options.inputMinLength
        ? (value = '') =>
            value.length < options.inputMinLength
              ? `Minimum ${options.inputMinLength} characters`
              : undefined
        : undefined),
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
  const content = document.createElement('div')

  const currentStock = document.createElement('div')
  currentStock.className = 'stock-swal-current'
  currentStock.append('Current stock: ')
  currentStock.append(
    createTextElement(
      'strong',
      '',
      `${safeNumber(product.stockQuantity)} ${safeText(product.unit)}`.trim(),
    ),
  )
  content.append(currentStock)

  const typeLabel = createTextElement(
    'label',
    'stock-swal-label',
    'Movement',
  )
  typeLabel.setAttribute('for', 'stock-movement-type')
  content.append(typeLabel)

  const typeSelect = document.createElement('select')
  typeSelect.id = 'stock-movement-type'
  typeSelect.className = 'swal2-select stock-swal-select'
  const movementTypeOptions = [
    ['in', 'Stock In'],
    ['out', 'Stock Out'],
    ['set', 'Set Exact Stock'],
  ]
  movementTypeOptions.forEach(([value, label]) => {
    const option = document.createElement('option')
    option.value = value
    option.textContent = label
    typeSelect.append(option)
  })
  content.append(typeSelect)

  const quantityLabel = createTextElement(
    'label',
    'stock-swal-label',
    'Quantity',
  )
  quantityLabel.setAttribute('for', 'stock-movement-quantity')
  content.append(quantityLabel)

  const quantityInput = document.createElement('input')
  quantityInput.id = 'stock-movement-quantity'
  quantityInput.className = 'swal2-input stock-swal-input'
  quantityInput.type = 'number'
  quantityInput.min = '0'
  quantityInput.step = '0.01'
  quantityInput.placeholder = '0'
  content.append(quantityInput)

  const noteLabel = createTextElement('label', 'stock-swal-label', 'Note')
  noteLabel.setAttribute('for', 'stock-movement-note')
  content.append(noteLabel)

  const noteInput = document.createElement('input')
  noteInput.id = 'stock-movement-note'
  noteInput.className = 'swal2-input stock-swal-input'
  noteInput.type = 'text'
  noteInput.placeholder = 'Purchase, damaged, adjustment...'
  content.append(noteInput)

  const recentMovements = (product.stockMovements || []).slice(-5).reverse()
  if (recentMovements.length) {
    const history = document.createElement('div')
    history.className = 'stock-history'
    history.append(createTextElement('b', '', 'Recent movements'))

    recentMovements.forEach((movement) => {
      const row = document.createElement('div')
      row.className = 'stock-history-row'

      const type = createTextElement(
        'span',
        `stock-movement-type stock-movement-type-${stockMovementTypeClass(
          movement.type,
        )}`,
        movement.type,
      )
      const quantity = createTextElement(
        'strong',
        '',
        `${safeNumber(movement.quantity)} ${safeText(product.unit)}`.trim(),
      )
      const note = createTextElement(
        'small',
        '',
        movement.note || movement.recordedBy || '',
      )

      row.append(type, quantity, note)
      history.append(row)
    })

    content.append(history)
  }

  const result = await Swal.fire({
    titleText: `Stock: ${safeText(product.name)}`,
    html: content,
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
      if (type === 'out' && quantity > safeNumber(product.stockQuantity)) {
        Swal.showValidationMessage('Stock out exceeds current stock')
        return false
      }
      return { type, quantity, note }
    },
  })

  return result.isConfirmed ? result.value : false
}
