import mongoose from 'mongoose'

const stockMovementSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['in', 'out', 'set'],
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    previousStock: {
      type: Number,
      required: true,
      min: 0,
    },
    resultingStock: {
      type: Number,
      required: true,
      min: 0,
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
    recordedAt: {
      type: Date,
      default: Date.now,
    },
    referenceType: {
      type: String,
      trim: true,
      default: '',
    },
    referenceId: {
      type: String,
      trim: true,
      default: '',
    },
    unitCost: {
      type: Number,
      min: 0,
      default: null,
    },
  },
  { _id: true },
)

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
    },
    itemCode: {
      type: String,
      trim: true,
      uppercase: true,
      default: '',
    },
    colorCode: {
      type: String,
      trim: true,
      default: '',
    },
    unit: {
      type: String,
      trim: true,
      required: [true, 'Product unit is required'],
    },
    unitPrice: {
      type: Number,
      min: [0, 'Unit price cannot be negative'],
      required: true,
    },
    costPrice: {
      type: Number,
      min: [0, 'Cost price cannot be negative'],
      default: 0,
    },
    stockQuantity: {
      type: Number,
      min: [0, 'Stock quantity cannot be negative'],
      default: 0,
    },
    lowStockThreshold: {
      type: Number,
      min: [0, 'Low stock threshold cannot be negative'],
      default: 5,
    },
    stockMovements: {
      type: [stockMovementSchema],
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
  },
  { timestamps: true },
)

productSchema.index(
  { itemCode: 1 },
  {
    unique: true,
    partialFilterExpression: { itemCode: { $type: 'string', $gt: '' } },
  },
)
productSchema.index({ name: 'text', itemCode: 'text', colorCode: 'text' })

export default mongoose.model('Product', productSchema)
