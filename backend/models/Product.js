import mongoose from 'mongoose'

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
