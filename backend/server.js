import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import connectDB, { getStorageMode } from './config/db.js'
import auditRoutes from './routes/auditRoutes.js'
import authRoutes from './routes/authRoutes.js'
import customerRoutes from './routes/customerRoutes.js'
import invoiceRoutes from './routes/invoiceRoutes.js'
import productRoutes from './routes/productRoutes.js'
import reportRoutes from './routes/reportRoutes.js'
import { migrateExistingData } from './services/migrationService.js'

dotenv.config()

const app = express()
const port = process.env.PORT || 5000
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

app.set('trust proxy', 1)

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true)
      }
      return callback(new Error('Origin is not allowed by CORS'))
    },
  }),
)
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'jotun-billing-api',
    storage: getStorageMode(),
  })
})

app.use('/api/auth', authRoutes)
app.use('/api/invoices', invoiceRoutes)
app.use('/api/customers', customerRoutes)
app.use('/api/products', productRoutes)
app.use('/api/audit-logs', auditRoutes)
app.use('/api/reports', reportRoutes)

app.use((_req, res) => {
  res.status(404).json({ message: 'Route not found' })
})

app.use((error, _req, res, _next) => {
  console.error(error)
  res.status(500).json({ message: 'Internal server error' })
})

const startServer = async () => {
  await connectDB()
  await migrateExistingData()
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${port}`)
  })
}

startServer().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
