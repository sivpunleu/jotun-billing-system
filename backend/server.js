import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import helmet from 'helmet'
import connectDB, { getStorageMode } from './config/db.js'
import { apiRateLimit } from './middleware/apiRateLimit.js'
import { standardJsonBody } from './middleware/jsonBody.js'
import auditRoutes from './routes/auditRoutes.js'
import authRoutes from './routes/authRoutes.js'
import customerRoutes from './routes/customerRoutes.js'
import invoiceRoutes from './routes/invoiceRoutes.js'
import insightRoutes from './routes/insightRoutes.js'
import productRoutes from './routes/productRoutes.js'
import purchaseRoutes from './routes/purchaseRoutes.js'
import reportRoutes from './routes/reportRoutes.js'
import salespersonRoutes from './routes/salespersonRoutes.js'
import settingsRoutes from './routes/settingsRoutes.js'
import supplierRoutes from './routes/supplierRoutes.js'
import { startAutomatedBackupScheduler } from './services/backupScheduler.js'
import { migrateExistingData } from './services/migrationService.js'

dotenv.config()

const app = express()
const port = process.env.PORT || 5000
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

app.set('trust proxy', 1)
app.disable('x-powered-by')

const helmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}
if (process.env.NODE_ENV !== 'production') {
  helmetOptions.strictTransportSecurity = false
}

app.use(helmet(helmetOptions))
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
app.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store')
  next()
})

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'jotun-billing-api',
    storage: getStorageMode(),
  })
})

app.use('/api', apiRateLimit)

// These routers authenticate before parsing their intentionally larger payloads.
app.use('/api/reports', reportRoutes)
app.use('/api/settings', settingsRoutes)

app.use(standardJsonBody)
app.use('/api/auth', authRoutes)
app.use('/api/invoices', invoiceRoutes)
app.use('/api/customers', customerRoutes)
app.use('/api/products', productRoutes)
app.use('/api/purchases', purchaseRoutes)
app.use('/api/salespeople', salespersonRoutes)
app.use('/api/suppliers', supplierRoutes)
app.use('/api/audit-logs', auditRoutes)
app.use('/api/insights', insightRoutes)

app.use((_req, res) => {
  res.status(404).json({ message: 'Route not found' })
})

app.use((error, _req, res, _next) => {
  console.error(error)
  if (error.type === 'entity.too.large') {
    return res.status(413).json({
      message: 'Request data is too large',
    })
  }
  if (error instanceof SyntaxError && error.type === 'entity.parse.failed') {
    return res.status(400).json({
      message: 'Request body contains invalid JSON',
    })
  }
  if (error.message === 'Origin is not allowed by CORS') {
    return res.status(403).json({ message: error.message })
  }
  res.status(500).json({ message: 'Internal server error' })
})

const startServer = async () => {
  await connectDB()
  await migrateExistingData()
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${port}`)
    startAutomatedBackupScheduler()
  })
}

startServer().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
