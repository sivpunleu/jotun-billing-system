import express from 'express'
import {
  getNotifications,
  globalSearch,
} from '../controllers/insightController.js'
import { requireAdmin } from '../middleware/authMiddleware.js'

const router = express.Router()

router.get('/search', requireAdmin, globalSearch)
router.get('/notifications', requireAdmin, getNotifications)

export default router
