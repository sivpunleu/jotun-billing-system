import express from 'express'
import { supplierController } from '../controllers/catalogController.js'
import {
  authorizeRoles,
  requireAdmin,
} from '../middleware/authMiddleware.js'

const router = express.Router()
const canManage = authorizeRoles('owner', 'admin')

router
  .route('/')
  .get(requireAdmin, supplierController.list)
  .post(requireAdmin, canManage, supplierController.create)
router.post(
  '/:id/restore',
  requireAdmin,
  canManage,
  supplierController.restore,
)
router
  .route('/:id')
  .put(requireAdmin, canManage, supplierController.update)
  .delete(requireAdmin, canManage, supplierController.remove)

export default router
