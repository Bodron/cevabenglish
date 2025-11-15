const express = require('express')
const rateLimit = require('express-rate-limit')
const {
  listCategories,
  getCategoryById,
} = require('../controllers/categoryController')

const router = express.Router()

const categoriesLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
})

router.use(categoriesLimiter)

router.get('/', listCategories)
router.get('/:id', getCategoryById)

module.exports = router
