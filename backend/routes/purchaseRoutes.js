import express from 'express'
import {
  cancelPurchase,
  createPurchase,
  getPurchaseById,
  getPurchases,
  receivePurchase,
  updatePurchase,
} from '../controllers/purchaseController.js'
import {
  authorizeRoles,
  requireAdmin,
} from '../middleware/authMiddleware.js'

const router = express.Router()
const canManage = authorizeRoles('owner', 'admin')

router
  .route('/')
  .get(requireAdmin, getPurchases)
  .post(requireAdmin, canManage, createPurchase)
router.post('/:id/receive', requireAdmin, canManage, receivePurchase)
router.post('/:id/cancel', requireAdmin, canManage, cancelPurchase)
router
  .route('/:id')
  .get(requireAdmin, getPurchaseById)
  .put(requireAdmin, canManage, updatePurchase)

export default router
