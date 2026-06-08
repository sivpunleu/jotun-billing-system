import express from 'express'
import {
  exportDatabaseBackup,
  exportInvoicesCsv,
} from '../controllers/reportController.js'
import {
  authorizeRoles,
  requireAdmin,
} from '../middleware/authMiddleware.js'

const router = express.Router()

router.get('/invoices.csv', requireAdmin, exportInvoicesCsv)
router.get(
  '/backup.json',
  requireAdmin,
  authorizeRoles('owner'),
  exportDatabaseBackup,
)

export default router
