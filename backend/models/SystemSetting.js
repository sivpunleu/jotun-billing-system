import mongoose from 'mongoose'

const systemSettingSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      unique: true,
      default: 'default',
    },
    companyName: {
      type: String,
      trim: true,
      default: 'Marvel Decor & JOTUN',
    },
    companyNameKh: {
      type: String,
      trim: true,
      default: 'ម៉ាវែល ដេគ័រ & JOTUN',
    },
    address: {
      type: String,
      trim: true,
      default: '',
    },
    telegram: {
      type: String,
      trim: true,
      default: '068 8888 70',
    },
    phones: {
      type: [String],
      default: ['098 689 883', '068 888 870'],
    },
    paymentAccount: {
      type: String,
      trim: true,
      default: 'ABA : 068 888 187',
    },
    invoiceNotes: {
      type: String,
      trim: true,
      default:
        '- ទំនិញទិញហើយមិនអាចប្ដូរ ឬសងត្រឡប់វិញបានទេ\n- រាល់ការទូទាត់ត្រូវមានវិក្កយបត្រត្រឹមត្រូវ',
    },
    footerKh: {
      type: String,
      trim: true,
      default: 'សូមអរគុណចំពោះការគាំទ្រ !',
    },
    footerEn: {
      type: String,
      trim: true,
      default: 'Thank you for support !',
    },
    logo: {
      type: String,
      default: '',
    },
    jotunLogo: {
      type: String,
      default: '',
    },
    paymentQr: {
      type: String,
      default: '',
    },
    sellerSignature: {
      type: String,
      default: '',
    },
    updatedBy: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { timestamps: true },
)

export default mongoose.model('SystemSetting', systemSettingSchema)
