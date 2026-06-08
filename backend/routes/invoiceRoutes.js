import express from 'express'
import {
  addInvoicePayment,
  createInvoice,
  deleteInvoice,
  getDashboard,
  getInvoiceById,
  getInvoices,
  restoreDeletedInvoice,
  updateInvoice,
} from '../controllers/invoiceController.js'
import {
  authorizeRoles,
  requireAdmin,
} from '../middleware/authMiddleware.js'

const router = express.Router()
const canManage = authorizeRoles('owner', 'admin')

router.get('/dashboard', requireAdmin, getDashboard)
router
  .route('/')
  .get(requireAdmin, getInvoices)
  .post(requireAdmin, canManage, createInvoice)
router.post('/:id/payments', requireAdmin, canManage, addInvoicePayment)
router.post('/:id/restore', requireAdmin, canManage, restoreDeletedInvoice)
router
  .route('/:id')
  .get(getInvoiceById)
  .put(requireAdmin, canManage, updateInvoice)
  .delete(requireAdmin, canManage, deleteInvoice)

export default router
