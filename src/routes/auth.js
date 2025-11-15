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

module.exports = router
