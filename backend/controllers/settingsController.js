import { Buffer } from 'node:buffer'
import { writeAuditLog } from '../repositories/auditRepository.js'
import {
  getSystemSettings,
  saveSystemSettings,
} from '../repositories/settingsRepository.js'

const MAX_IMAGE_DATA_URI_LENGTH = 2_500_000
const MAX_IMAGE_DECODED_BYTES = 1_875_000
const MAX_IMAGE_DIMENSION = 10_000
const MAX_IMAGE_PIXELS = 25_000_000
const IMAGE_DATA_URI_PATTERN =
  /^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/]+={0,2})$/i
const ALLOWED_LEGACY_IMAGE_PATTERN =
  /^data:image\/(?:png|jpe?g|webp);base64,/i

const normalizeMimeType = (mimeType) =>
  mimeType.toLowerCase() === 'image/jpg'
    ? 'image/jpeg'
    : mimeType.toLowerCase()

const matchesBytes = (buffer, signature) =>
  signature.every((byte, index) => buffer[index] === byte)

const getPngDimensions = (buffer) => {
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (
    buffer.length < 24 ||
    !matchesBytes(buffer, pngSignature) ||
    buffer.toString('ascii', 12, 16) !== 'IHDR'
  ) {
    throw new Error('Uploaded PNG image is malformed')
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

const getJpegDimensions = (buffer) => {
  if (
    buffer.length < 4 ||
    buffer[0] !== 0xff ||
    buffer[1] !== 0xd8 ||
    buffer[2] !== 0xff
  ) {
    throw new Error('Uploaded JPEG image is malformed')
  }

  let offset = 2
  while (offset < buffer.length) {
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1
    if (offset >= buffer.length) break

    const marker = buffer[offset]
    offset += 1
    if (marker === 0xd8 || marker === 0xd9) continue
    if (marker >= 0xd0 && marker <= 0xd7) continue
    if (offset + 2 > buffer.length) break

    const segmentLength = buffer.readUInt16BE(offset)
    if (segmentLength < 2 || offset + segmentLength > buffer.length) break

    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    if (isStartOfFrame) {
      if (segmentLength < 7) break
      return {
        width: buffer.readUInt16BE(offset + 5),
        height: buffer.readUInt16BE(offset + 3),
      }
    }

    offset += segmentLength
  }

  throw new Error('Uploaded JPEG image is malformed')
}

const readUInt24LE = (buffer, offset) =>
  buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16)

const getWebpDimensions = (buffer) => {
  if (
    buffer.length < 16 ||
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    throw new Error('Uploaded WEBP image is malformed')
  }

  const chunkType = buffer.toString('ascii', 12, 16)
  if (chunkType === 'VP8X') {
    if (buffer.length < 30) {
      throw new Error('Uploaded WEBP image is malformed')
    }
    return {
      width: readUInt24LE(buffer, 24) + 1,
      height: readUInt24LE(buffer, 27) + 1,
    }
  }

  if (chunkType === 'VP8L') {
    if (buffer[20] !== 0x2f || buffer.length < 25) {
      throw new Error('Uploaded WEBP image is malformed')
    }
    const b1 = buffer[21]
    const b2 = buffer[22]
    const b3 = buffer[23]
    const b4 = buffer[24]
    return {
      width: 1 + b1 + ((b2 & 0x3f) << 8),
      height: 1 + ((b2 >> 6) | (b3 << 2) | ((b4 & 0x0f) << 10)),
    }
  }

  if (chunkType === 'VP8 ') {
    if (
      buffer.length < 30 ||
      buffer[23] !== 0x9d ||
      buffer[24] !== 0x01 ||
      buffer[25] !== 0x2a
    ) {
      throw new Error('Uploaded WEBP image is malformed')
    }
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    }
  }

  throw new Error('Uploaded WEBP image is malformed')
}

const getImageInfo = (buffer) => {
  if (matchesBytes(buffer, [0x89, 0x50, 0x4e, 0x47])) {
    return { mimeType: 'image/png', ...getPngDimensions(buffer) }
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mimeType: 'image/jpeg', ...getJpegDimensions(buffer) }
  }
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { mimeType: 'image/webp', ...getWebpDimensions(buffer) }
  }

  throw new Error('Uploaded image file type is not allowed')
}

const validateImageDimensions = ({ width, height }) => {
  if (!width || !height || width < 1 || height < 1) {
    throw new Error('Uploaded image has invalid dimensions')
  }
  if (
    width > MAX_IMAGE_DIMENSION ||
    height > MAX_IMAGE_DIMENSION ||
    width * height > MAX_IMAGE_PIXELS
  ) {
    throw new Error('Uploaded image dimensions are too large')
  }
}

const parseImageDataUri = (image) => {
  const match = image.match(IMAGE_DATA_URI_PATTERN)
  if (!match) {
    throw new Error('Uploaded image must be a JPG, PNG, or WEBP data image')
  }

  const mimeType = normalizeMimeType(match[1])
  const base64Data = match[2]
  if (base64Data.length % 4 !== 0) {
    throw new Error('Uploaded image data is malformed')
  }

  const buffer = Buffer.from(base64Data, 'base64')
  if (!buffer.length || buffer.toString('base64') !== base64Data) {
    throw new Error('Uploaded image data is malformed')
  }
  if (buffer.length > MAX_IMAGE_DECODED_BYTES) {
    throw new Error('Uploaded image is too large')
  }

  return { mimeType, buffer }
}

const cleanImage = (value, previousValue = '') => {
  const image = String(value || '').trim()
  if (!image) return ''

  if (image.length > MAX_IMAGE_DATA_URI_LENGTH) {
    throw new Error('Uploaded image is too large')
  }

  const previousImage = String(previousValue || '').trim()
  if (
    previousImage &&
    image === previousImage &&
    ALLOWED_LEGACY_IMAGE_PATTERN.test(previousImage)
  ) {
    return previousImage
  }

  const { mimeType, buffer } = parseImageDataUri(image)
  const imageInfo = getImageInfo(buffer)
  if (imageInfo.mimeType !== mimeType) {
    throw new Error('Uploaded image MIME type does not match its content')
  }
  validateImageDimensions(imageInfo)

  return image
}

const cleanInvoiceFontSize = (value) => {
  const size = Number(value || 13)
  if (!Number.isFinite(size)) {
    throw new Error('Invoice font size is invalid')
  }
  if (size < 9 || size > 18) {
    throw new Error('Invoice font size must be between 9 and 18')
  }
  return Math.round(size * 10) / 10
}

const cleanInvoicePaperSize = (value) => {
  const paperSize = String(value || 'a5').trim().toLowerCase()
  if (!['a4', 'a5'].includes(paperSize)) {
    throw new Error('Invoice paper size must be A4 or A5')
  }
  return paperSize
}

export const readSystemSettings = async (_req, res) => {
  try {
    res.json(await getSystemSettings())
  } catch (error) {
    res.status(400).json({
      message: error.message || 'Unable to load system settings',
    })
  }
}

export const updateSystemSettings = async (req, res) => {
  try {
    const currentSettings = await getSystemSettings()
    const phones = Array.isArray(req.body.phones)
      ? req.body.phones
      : String(req.body.phones || '').split(',')
    const payload = {
      companyName: String(req.body.companyName || '').trim(),
      companyNameKh: String(req.body.companyNameKh || '').trim(),
      address: String(req.body.address || '').trim(),
      telegram: String(req.body.telegram || '').trim(),
      phones: phones.map((phone) => String(phone).trim()).filter(Boolean),
      paymentAccount: String(req.body.paymentAccount || '').trim(),
      invoiceNotes: String(req.body.invoiceNotes || '').trim(),
      invoiceFontSize: cleanInvoiceFontSize(req.body.invoiceFontSize),
      invoicePaperSize: cleanInvoicePaperSize(req.body.invoicePaperSize),
      footerKh: String(req.body.footerKh || '').trim(),
      footerEn: String(req.body.footerEn || '').trim(),
      logo: cleanImage(req.body.logo, currentSettings.logo),
      jotunLogo: cleanImage(req.body.jotunLogo, currentSettings.jotunLogo),
      paymentQr: cleanImage(req.body.paymentQr, currentSettings.paymentQr),
      sellerSignature: cleanImage(
        req.body.sellerSignature,
        currentSettings.sellerSignature,
      ),
      updatedBy: req.admin.username,
    }
    if (!payload.companyName && !payload.companyNameKh) {
      throw new Error('Company name is required')
    }

    const settings = await saveSystemSettings(payload)
    await writeAuditLog({
      actor: req.admin,
      action: 'update',
      entityType: 'settings',
      entityId: 'default',
      summary: 'System settings',
    })
    res.json(settings)
  } catch (error) {
    res.status(400).json({
      message: error.message || 'Unable to save system settings',
    })
  }
}
