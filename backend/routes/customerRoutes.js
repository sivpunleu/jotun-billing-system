import express from 'express'
import { customerController } from '../controllers/catalogController.js'
import {
  authorizeRoles,
  requireAdmin,
} from '../middleware/authMiddleware.js'

const router = express.Router()
const canManage = authorizeRoles('owner', 'admin')

router
  .route('/')
  .get(requireAdmin, customerController.list)
  .post(requireAdmin, canManage, customerController.create)
router.post(
  '/:id/restore',
  requireAdmin,
  canManage,
  customerController.restore,
)
router
  .route('/:id')
  .put(requireAdmin, canManage, customerController.update)
  .delete(requireAdmin, canManage, customerController.remove)

export default router
