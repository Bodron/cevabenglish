const express = require('express')
const rateLimit = require('express-rate-limit')
const { protect } = require('../middleware/auth')
const {
  markLearnedBatch,
  summaryByCategory,
  listLearned,
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

router.post('/learn', markLearnedBatch)
router.get('/summary', summaryByCategory)
router.get('/learned', listLearned)

module.exports = router
