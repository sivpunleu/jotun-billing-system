import mongoose from 'mongoose'

const refreshTokenSchema = new mongoose.Schema(
  {
    tokenHash: {
      type: String,
      required: true,
    },
    sessionId: {
      type: String,
      required: true,
      trim: true,
    },
    accessTokenId: {
      type: String,
      trim: true,
      default: '',
    },
    tokenVersion: {
      type: Number,
      default: 0,
      min: 0,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    lastUsedAt: {
      type: Date,
      default: Date.now,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    rotatedAt: {
      type: Date,
      default: null,
    },
    replacedByHash: {
      type: String,
      default: '',
    },
    ipAddress: {
      type: String,
      trim: true,
      default: '',
    },
    userAgent: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { _id: false },
)

const revokedAccessTokenSchema = new mongoose.Schema(
  {
    tokenId: {
      type: String,
      required: true,
      trim: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    revokedAt: {
      type: Date,
      default: Date.now,
    },
    reason: {
      type: String,
      trim: true,
      default: 'logout',
    },
  },
  { _id: false },
)

const adminSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    displayName: {
      type: String,
      trim: true,
      default: '',
    },
    avatar: {
      type: String,
      default: '',
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'viewer'],
      default: 'admin',
    },
    active: {
      type: Boolean,
      default: true,
    },
    tokenVersion: {
      type: Number,
      default: 0,
      min: 0,
      select: false,
    },
    refreshTokens: {
      type: [refreshTokenSchema],
      default: [],
      select: false,
    },
    revokedAccessTokens: {
      type: [revokedAccessTokenSchema],
      default: [],
      select: false,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: String,
      trim: true,
      default: '',
    },
  },
  { timestamps: true },
)

export default mongoose.model('Admin', adminSchema)
