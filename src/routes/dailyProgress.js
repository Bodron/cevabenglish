const express = require('express')
const rateLimit = require('express-rate-limit')
const { protect } = require('../middleware/auth')
const {
  getDailyProgress,
  incrementDailyProgress,
} = require('../controllers/progressController')

const router = express.Router()

const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
})

router.use(limiter)
router.use(protect)

router.get('/', getDailyProgress)
router.post('/increment', incrementDailyProgress)

module.exports = router
