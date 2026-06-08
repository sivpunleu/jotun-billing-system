import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import connectDB, { getStorageMode } from './config/db.js'
import invoiceRoutes from './routes/invoiceRoutes.js'

dotenv.config()

const app = express()
const port = process.env.PORT || 5000
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

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

app.use('/api/invoices', invoiceRoutes)

app.use((_req, res) => {
  res.status(404).json({ message: 'Route not found' })
})

app.use((error, _req, res, _next) => {
  console.error(error)
  res.status(500).json({ message: 'Internal server error' })
})

const startServer = async () => {
  await connectDB()
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${port}`)
  })
}

startServer().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
