const UserWordProgress = require('../models/UserWordProgress')
const WordCategory = require('../models/WordCategory')

async function markLearnedBatch(req, res, next) {
  try {
    const userId = req.user._id
    const { categoryId, items } = req.body || {}
    if (!categoryId || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Invalid payload' })
    }

    // Fetch category to optionally denormalize english/romanian by itemId
    const category = await WordCategory.findById(categoryId, {
      items: 1,
    }).lean()
    if (!category)
      return res.status(404).json({ message: 'Category not found' })

    const itemMap = new Map(
      (category.items || []).map((it) => [
        String(it._id),
        { english: it.english, romanian: it.romanian },
      ])
    )

    const ops = items.map((it) => {
      const idStr = String(it.itemId || it.id || '')
      const fromCat = itemMap.get(idStr) || {}
      const english = it.english || fromCat.english || ''
      const romanian = it.romanian || fromCat.romanian || ''
      return {
        updateOne: {
          filter: { user: userId, category: categoryId, itemId: idStr },
          update: {
            $setOnInsert: { english, romanian, learnedAt: new Date() },
            $set: { status: 'learned', lastSeenAt: new Date() },
            $inc: { correctStreak: 1 },
          },
          upsert: true,
        },
      }
    })

    await UserWordProgress.bulkWrite(ops, { ordered: false })
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
}

async function summaryByCategory(req, res, next) {
  try {
    const userId = req.user._id
    const data = await UserWordProgress.aggregate([
      { $match: { user: userId, status: 'learned' } },
      { $group: { _id: '$category', learned: { $sum: 1 } } },
    ])
    res.json({ data })
  } catch (err) {
    next(err)
  }
}

async function listLearned(req, res, next) {
  try {
    const userId = req.user._id
    const { categoryId, skip = 0, limit = 50 } = req.query || {}
    const q = { user: userId, status: 'learned' }
    if (categoryId) q.category = categoryId
    const items = await UserWordProgress.find(
      q,
      'category itemId english romanian learnedAt'
    )
      .sort({ learnedAt: -1 })
      .skip(Number(skip))
      .limit(Math.min(Number(limit), 200))
      .lean()
    res.json({ data: items })
  } catch (err) {
    next(err)
  }
}

module.exports = { markLearnedBatch, summaryByCategory, listLearned }
