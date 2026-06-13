import mongoose from 'mongoose'
import {
  createShareToken,
  createShareTokenExpiration,
} from '../utils/shareToken.js'

const itemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null,
    },
    description: {
      type: String,
      required: [true, 'Item description is required'],
      trim: true,
    },
    itemCode: {
      type: String,
      trim: true,
      default: '',
    },
    colorCode: {
      type: String,
      trim: true,
      default: '',
    },
    quantity: {
      type: Number,
      required: true,
      min: [0.01, 'Quantity must be greater than zero'],
    },
    unit: {
      type: String,
      trim: true,
      default: '',
    },
    unitPrice: {
      type: Number,
      required: true,
      min: [0, 'Unit price cannot be negative'],
    },
    costPrice: {
      type: Number,
      default: 0,
      min: [0, 'Item cost price cannot be negative'],
    },
    discount: {
      type: Number,
      default: 0,
      min: [0, 'Item discount cannot be negative'],
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: true },
)

const paymentSchema = new mongoose.Schema(
  {
    amount: {
      type: Number,
      required: true,
      min: [0.01, 'Payment amount must be greater than zero'],
    },
    paidAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    receivedBy: {
      type: String,
      required: true,
      trim: true,
    },
    note: {
      type: String,
      trim: true,
      default: '',
    },
    recordedBy: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { _id: true, timestamps: true },
)

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    shareToken: {
      type: String,
      trim: true,
      default: createShareToken,
    },
    shareTokenExpiresAt: {
      type: Date,
      default: createShareTokenExpiration,
    },
    shareTokenRevokedAt: {
      type: Date,
      default: null,
    },
    invoiceDate: {
      type: Date,
      required: true,
      default: Date.now,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    customer: {
      name: {
        type: String,
        required: [true, 'Customer name is required'],
        trim: true,
      },
      phone: {
        type: String,
        trim: true,
        default: '',
      },
      address: {
        type: String,
        trim: true,
        default: '',
      },
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
    },
    salesChannel: {
      type: String,
      enum: ['store', 'salesperson'],
      default: 'store',
      index: true,
    },
    salespersonId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Salesperson',
      default: null,
      index: true,
    },
    salesperson: {
      name: {
        type: String,
        trim: true,
        default: '',
      },
      phone: {
        type: String,
        trim: true,
        default: '',
      },
    },
    items: {
      type: [itemSchema],
      validate: {
        validator: (items) => items.length > 0,
        message: 'At least one invoice item is required',
      },
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
    },
    taxRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    taxAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    deliveryFee: {
      type: Number,
      default: 0,
      min: 0,
    },
    depositRate: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    depositAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    grandTotal: {
      type: Number,
      required: true,
      min: 0,
    },
    balanceDue: {
      type: Number,
      required: true,
      min: 0,
    },
    paidAmount: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ['draft', 'unpaid', 'partially_paid', 'paid', 'cancelled'],
      default: 'unpaid',
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'partial', 'paid'],
      default: 'unpaid',
    },
    payments: {
      type: [paymentSchema],
      default: [],
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    createdBy: {
      type: String,
      trim: true,
      default: '',
    },
    updatedBy: {
      type: String,
      trim: true,
      default: '',
    },
    deletedAt: {
      type: Date,
      default: null,
      index: true,
    },
    deletedBy: {
      type: String,
      trim: true,
      default: '',
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
)

invoiceSchema.index({ createdAt: -1 })
invoiceSchema.index({ deletedAt: 1, createdAt: -1 })
invoiceSchema.index({ 'customer.name': 'text', invoiceNumber: 'text' })
invoiceSchema.index({ salesChannel: 1, salespersonId: 1, invoiceDate: -1 })
invoiceSchema.index(
  { shareToken: 1 },
  {
    unique: true,
    partialFilterExpression: { shareToken: { $type: 'string', $gt: '' } },
  },
)

export default mongoose.model('Invoice', invoiceSchema)
