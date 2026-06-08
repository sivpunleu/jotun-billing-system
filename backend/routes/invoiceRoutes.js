import express from 'express'
import {
  createInvoice,
  deleteInvoice,
  getInvoiceById,
  getInvoices,
  updateInvoice,
} from '../controllers/invoiceController.js'
import { requireAdmin } from '../middleware/authMiddleware.js'

const router = express.Router()

router.route('/').get(requireAdmin, getInvoices).post(requireAdmin, createInvoice)
router
  .route('/:id')
  .get(getInvoiceById)
  .put(requireAdmin, updateInvoice)
  .delete(requireAdmin, deleteInvoice)

export default router
