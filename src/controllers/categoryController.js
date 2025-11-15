const WordCategory = require('../models/WordCategory')

async function listCategories(req, res, next) {
  try {
    const categories = await WordCategory.find({}, 'category total image')
      .sort({ category: 1 })
      .lean()

    res.json({
      data: categories.map((doc) => ({
        id: doc._id,
        category: doc.category,
        total: doc.total,
        image: doc.image || null,
      })),
    })
  } catch (err) {
    next(err)
  }
}

async function getCategoryById(req, res, next) {
  try {
    const { id } = req.params
    const category = await WordCategory.findById(id).lean()
    if (!category) {
      return res.status(404).json({ message: 'Category not found' })
    }
    res.json({
      data: {
        id: category._id,
        category: category.category,
        total: category.total,
        image: category.image || null,
        items: (category.items || []).map((it) => ({
          id: it._id?.toString(),
          english: it.english,
          romanian: it.romanian,
        })),
      },
    })
  } catch (err) {
    next(err)
  }
}

module.exports = {
  listCategories,
  getCategoryById,
}
