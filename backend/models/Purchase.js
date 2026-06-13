import mongoose from 'mongoose'

const purchaseItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    colorCode: {
      type: String,
      trim: true,
      default: '',
    },
    unit: {
      type: String,
      trim: true,
      default: '',
    },
    quantity: {
      type: Number,
      required: true,
      min: 0.01,
    },
    unitCost: {
      type: Number,
      required: true,
      min: 0,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
    previousStock: {
      type: Number,
      min: 0,
      default: null,
    },
    previousCostPrice: {
      type: Number,
      min: 0,
      default: null,
    },
    resultingCostPrice: {
      type: Number,
      min: 0,
      default: null,
    },
  },
  { _id: true },
)

const purchaseSchema = new mongoose.Schema(
  {
    purchaseNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    purchaseDate: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      required: true,
      index: true,
    },
    supplier: {
      name: {
        type: String,
        required: true,
        trim: true,
      },
      phone: {
        type: String,
        trim: true,
        default: '',
      },
    },
    items: {
      type: [purchaseItemSchema],
      validate: {
        validator: (items) => items.length > 0,
        message: 'At least one purchase item is required',
      },
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['draft', 'receiving', 'received', 'cancelled'],
      default: 'draft',
      index: true,
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    receivedAt: {
      type: Date,
      default: null,
    },
    receivedBy: {
      type: String,
      trim: true,
      default: '',
    },
    cancelledAt: {
      type: Date,
      default: null,
    },
    cancelledBy: {
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
  },
  { timestamps: true },
)

purchaseSchema.index({ createdAt: -1 })
purchaseSchema.index({
  purchaseNumber: 'text',
  'supplier.name': 'text',
})

export default mongoose.model('Purchase', purchaseSchema)
