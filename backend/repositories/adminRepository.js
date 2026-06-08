import { randomUUID } from 'node:crypto'
import { getStorageMode } from '../config/db.js'
import Admin from '../models/Admin.js'
import {
  mutateLocalCollection,
  readLocalCollection,
} from './localStore.js'

const withoutPassword = (admin) => {
  if (!admin) return null
  const plain = typeof admin.toObject === 'function' ? admin.toObject() : admin
  const { passwordHash: _passwordHash, ...safeAdmin } = plain
  return safeAdmin
}

export const findAdminByUsername = async (
  username,
  { includePassword = false } = {},
) => {
  const normalized = String(username || '').trim().toLowerCase()
  if (getStorageMode() === 'mongodb') {
    const query = Admin.findOne({ username: normalized })
    if (includePassword) query.select('+passwordHash')
    return query
  }
  const admins = await readLocalCollection('admins')
  const admin =
    admins.find((item) => item.username.toLowerCase() === normalized) || null
  return includePassword ? admin : withoutPassword(admin)
}

export const findAdminById = async (id) => {
  if (getStorageMode() === 'mongodb') {
    return Admin.findById(id)
  }
  const admins = await readLocalCollection('admins')
  return withoutPassword(
    admins.find((item) => String(item._id) === String(id)) || null,
  )
}

export const createAdmin = async (payload) => {
  if (getStorageMode() === 'mongodb') {
    const admin = await Admin.create(payload)
    return withoutPassword(admin)
  }
  return mutateLocalCollection('admins', (admins) => {
    if (
      admins.some(
        (item) =>
          item.username.toLowerCase() === payload.username.toLowerCase(),
      )
    ) {
      const error = new Error('Username already exists')
      error.code = 11000
      throw error
    }
    const timestamp = new Date().toISOString()
    const admin = {
      ...payload,
      username: payload.username.toLowerCase(),
      _id: randomUUID(),
      active: payload.active ?? true,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    admins.push(admin)
    return withoutPassword(admin)
  })
}

export const listAdmins = async () => {
  if (getStorageMode() === 'mongodb') {
    return Admin.find({}).sort({ createdAt: 1 })
  }
  const admins = await readLocalCollection('admins')
  return admins
    .map(withoutPassword)
    .sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt))
}

export const updateAdmin = async (id, payload) => {
  if (getStorageMode() === 'mongodb') {
    return Admin.findByIdAndUpdate(id, payload, {
      new: true,
      runValidators: true,
    })
  }
  return mutateLocalCollection('admins', (admins) => {
    const index = admins.findIndex((item) => String(item._id) === String(id))
    if (index === -1) return null
    admins[index] = {
      ...admins[index],
      ...payload,
      updatedAt: new Date().toISOString(),
    }
    return withoutPassword(admins[index])
  })
}

export const updateAdminPassword = async (id, passwordHash) => {
  if (getStorageMode() === 'mongodb') {
    return Admin.findByIdAndUpdate(
      id,
      { passwordHash },
      { new: true, runValidators: true },
    )
  }
  return updateAdmin(id, { passwordHash })
}

export const recordAdminLogin = async (id) => {
  if (!id) return null
  return updateAdmin(id, { lastLoginAt: new Date() })
}

export const getAllAdminsForBackup = async () => {
  if (getStorageMode() === 'mongodb') {
    return Admin.find({}).select('-passwordHash').lean()
  }
  return (await readLocalCollection('admins')).map(withoutPassword)
}
