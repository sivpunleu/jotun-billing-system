import mongoose from 'mongoose'

const backupSnapshotSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['manual', 'automatic', 'pre_restore'],
      default: 'manual',
      index: true,
    },
    label: {
      type: String,
      trim: true,
      default: '',
    },
    createdBy: {
      type: String,
      trim: true,
      default: 'system',
      index: true,
    },
    reason: {
      type: String,
      trim: true,
      default: '',
    },
    counts: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
  },
  { timestamps: true },
)

backupSnapshotSchema.index({ createdAt: -1 })

export default mongoose.model('BackupSnapshot', backupSnapshotSchema)
