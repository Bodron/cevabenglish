const express = require('express')
const rateLimit = require('express-rate-limit')
const { protect } = require('../middleware/auth')
const {
  markLearnedBatch,
  summaryByCategory,
  listLearned,
} = require('../controllers/progressController')

const router = express.Router()

// Pentru Benglish nu avem trafic masiv, așa că folosim un rate‑limit
// foarte permisiv doar ca protecție teoretică. Astfel, utilizatorii
// pot marca multe cuvinte ca „Știu deja” fără să mai primească 429.
const limiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10000,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
})

router.use(limiter)
router.use(protect)

router.post('/learn', markLearnedBatch)
router.get('/summary', summaryByCategory)
router.get('/learned', listLearned)

module.exports = router
