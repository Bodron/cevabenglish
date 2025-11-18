const express = require('express')
const rateLimit = require('express-rate-limit')
const {
  registerValidator,
  loginValidator,
} = require('../validators/authValidators')
const {
  register,
  login,
  refresh,
  me,
  logout,
  updateAvatar,
  forgotPassword,
  changePasswordWithToken,
} = require('../controllers/authController')
const { protect } = require('../middleware/auth')

const router = express.Router()

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' },
})

router.use(authLimiter)

router.post('/register', registerValidator, register)
router.post('/login', loginValidator, login)
router.post('/refresh', refresh)
router.get('/me', protect, me)
router.post('/logout', logout)
router.post('/forgot', forgotPassword)
router.post('/change-password-temp', changePasswordWithToken)

// Pentru upload avatar folosim raw body cu bytes (nu JSON).
const avatarRaw = express.raw({
  type: ['application/octet-stream', 'image/*'],
  limit: '10mb',
})
router.put('/avatar', avatarRaw, protect, updateAvatar)

module.exports = router
