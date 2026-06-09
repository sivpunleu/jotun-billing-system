import express from 'express'
import {
  exportDatabaseBackup,
  exportInvoicesCsv,
  getRevenueReport,
} from '../controllers/reportController.js'
import {
  authorizeRoles,
  requireAdmin,
} from '../middleware/authMiddleware.js'

const router = express.Router()

router.get('/revenue', requireAdmin, getRevenueReport)
router.get('/invoices.csv', requireAdmin, exportInvoicesCsv)
router.get(
  '/backup.json',
  requireAdmin,
  authorizeRoles('owner'),
  exportDatabaseBackup,
)

export default router
