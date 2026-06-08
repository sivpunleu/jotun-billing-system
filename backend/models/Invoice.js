import mongoose from 'mongoose'

const itemSchema = new mongoose.Schema(
  {
    description: {
      type: String,
      required: [true, 'Item description is required'],
      trim: true,
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
    unitPrice: {
      type: Number,
      required: true,
      min: [0, 'Unit price cannot be negative'],
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

const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
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
    paymentStatus: {
      type: String,
      enum: ['unpaid', 'partial', 'paid'],
      default: 'unpaid',
    },
    notes: {
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
invoiceSchema.index({ 'customer.name': 'text', invoiceNumber: 'text' })

export default mongoose.model('Invoice', invoiceSchema)
