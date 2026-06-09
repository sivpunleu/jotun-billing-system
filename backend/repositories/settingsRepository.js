import { getStorageMode } from '../config/db.js'
import SystemSetting from '../models/SystemSetting.js'
import {
  mutateLocalCollection,
  readLocalCollection,
} from './localStore.js'

export const defaultSystemSettings = {
  key: 'default',
  companyName: 'Marvel Decor & JOTUN',
  companyNameKh: 'ម៉ាវែល ដេគ័រ & JOTUN',
  address: '',
  telegram: '068 8888 70',
  phones: ['098 689 883', '068 888 870'],
  paymentAccount: 'ABA : 068 888 187',
  invoiceNotes:
    '- ទំនិញទិញហើយមិនអាចប្ដូរ ឬសងត្រឡប់វិញបានទេ\n- រាល់ការទូទាត់ត្រូវមានវិក្កយបត្រត្រឹមត្រូវ',
  footerKh: 'សូមអរគុណចំពោះការគាំទ្រ !',
  footerEn: 'Thank you for support !',
  logo: '',
  jotunLogo: '',
  paymentQr: '',
  sellerSignature: '',
  updatedBy: '',
}

export const getSystemSettings = async () => {
  if (getStorageMode() === 'mongodb') {
    const settings = await SystemSetting.findOne({ key: 'default' }).lean()
    return { ...defaultSystemSettings, ...(settings || {}) }
  }

  const [settings] = await readLocalCollection('system-settings')
  return { ...defaultSystemSettings, ...(settings || {}) }
}

export const saveSystemSettings = async (payload) => {
  if (getStorageMode() === 'mongodb') {
    return SystemSetting.findOneAndUpdate(
      { key: 'default' },
      { ...payload, key: 'default' },
      { new: true, upsert: true, runValidators: true },
    )
  }

  return mutateLocalCollection('system-settings', (records) => {
    const timestamp = new Date().toISOString()
    const existing = records[0] || {
      ...defaultSystemSettings,
      _id: 'default',
      createdAt: timestamp,
    }
    const settings = {
      ...existing,
      ...payload,
      key: 'default',
      _id: existing._id || 'default',
      updatedAt: timestamp,
    }
    records.splice(0, records.length, settings)
    return settings
  })
}
