const express = require('express')
const rateLimit = require('express-rate-limit')
const { protect } = require('../middleware/auth')
const {
  getReviewReadyCount,
  markReviewedBatch,
} = require('../controllers/progressController')

const router = express.Router()

// Rate‑limit foarte permisiv pentru rutele de review.
const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
})

router.use(limiter)
router.use(protect)

router.get('/ready', getReviewReadyCount)
router.post('/complete', markReviewedBatch)

module.exports = router
