import express from 'express'
import {
  addAdmin,
  changePassword,
  editAdmin,
  getAdmins,
  getCurrentAdmin,
  getProfile,
  getProfileActivity,
  loginAdmin,
  logoutAdmin,
  refreshAdminSession,
  updateProfile,
} from '../controllers/authController.js'
import {
  authorizeRoles,
  requireAdmin,
} from '../middleware/authMiddleware.js'
import { loginRateLimit } from '../middleware/loginRateLimit.js'

const router = express.Router()

router.post('/login', loginRateLimit, loginAdmin)
router.post('/refresh', refreshAdminSession)
router.post('/logout', requireAdmin, logoutAdmin)
router.get('/me', requireAdmin, getCurrentAdmin)
router
  .route('/profile')
  .get(requireAdmin, getProfile)
  .put(requireAdmin, updateProfile)
router.get('/profile/activity', requireAdmin, getProfileActivity)
router.post('/change-password', requireAdmin, changePassword)
router
  .route('/admins')
  .get(requireAdmin, authorizeRoles('owner'), getAdmins)
  .post(requireAdmin, authorizeRoles('owner'), addAdmin)
router.put(
  '/admins/:id',
  requireAdmin,
  authorizeRoles('owner'),
  editAdmin,
)

export default router
