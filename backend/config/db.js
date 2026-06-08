import mongoose from 'mongoose'

let storageMode = 'local-json'

const connectDB = async () => {
  try {
    const connection = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 3000,
    })
    storageMode = 'mongodb'
    console.log(`MongoDB connected: ${connection.connection.host}`)
    return storageMode
  } catch (error) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`MongoDB connection failed: ${error.message}`)
    }

    storageMode = 'local-json'
    console.warn(`MongoDB unavailable: ${error.message}`)
    console.warn('Using local JSON storage at backend/data/invoices.json')
    return storageMode
  }
}

export const getStorageMode = () => storageMode

export default connectDB
