import mongoose from 'mongoose'

const salespersonSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Salesperson name is required'],
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
      default: '',
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

salespersonSchema.index({ name: 1 })
salespersonSchema.index({ name: 'text', phone: 'text' })

export default mongoose.model('Salesperson', salespersonSchema)
