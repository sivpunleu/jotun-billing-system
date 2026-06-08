import express from 'express'
import {
  getCurrentAdmin,
  loginAdmin,
} from '../controllers/authController.js'
import { requireAdmin } from '../middleware/authMiddleware.js'
import { loginRateLimit } from '../middleware/loginRateLimit.js'

const router = express.Router()

router.post('/login', loginRateLimit, loginAdmin)
router.get('/me', requireAdmin, getCurrentAdmin)

export default router

