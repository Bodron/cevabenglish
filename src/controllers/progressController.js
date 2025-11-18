const UserWordProgress = require('../models/UserWordProgress')
const WordCategory = require('../models/WordCategory')
const DailyProgress = require('../models/DailyProgress')

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

/**
 * Get activity days - returns list of dates when user had any activity
 */
async function getActivityDays(req, res, next) {
  try {
    const userId = req.user._id

    // Get all unique dates from DailyProgress where user had any activity
    const days = await DailyProgress.find(
      {
        user: userId,
        $or: [
          { learned: { $gt: 0 } },
          { practiced: { $gt: 0 } },
          { reviewed: { $gt: 0 } },
        ],
      },
      'date'
    )
      .sort({ date: 1 })
      .lean()

    // Convert date strings to ISO format for Flutter
    const dates = days.map((d) => `${d.date}T00:00:00.000Z`)

    res.json({ data: dates })
  } catch (err) {
    next(err)
  }
}

/**
 * Get review ready count - returns count of words that need review
 */
async function getReviewReadyCount(req, res, next) {
  try {
    const userId = req.user._id
    const { countOnly, limit } = req.query

    // Words are ready for review if:
    // 1. Status is 'learned'
    // 2. lastSeenAt is older than 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

    if (countOnly === '1') {
      const count = await UserWordProgress.countDocuments({
        user: userId,
        status: 'learned',
        lastSeenAt: { $lt: oneDayAgo },
      })
      return res.json({ count })
    }

    const size = Math.min(Number(limit) || 100, 200)

    // If not countOnly, return the actual words
    const words = await UserWordProgress.find(
      {
        user: userId,
        status: 'learned',
        lastSeenAt: { $lt: oneDayAgo },
      },
      'category itemId english romanian lastSeenAt'
    )
      .sort({ lastSeenAt: 1 })
      .limit(size)
      .lean()

    res.json({ data: words })
  } catch (err) {
    next(err)
  }
}

/**
 * Get daily progress for a specific date
 */
async function getDailyProgress(req, res, next) {
  try {
    const userId = req.user._id
    const { date } = req.query

    if (!date) {
      return res.status(400).json({ message: 'Date parameter required' })
    }

    // Validate date format YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ message: 'Invalid date format' })
    }

    const progress = await DailyProgress.findOne(
      { user: userId, date },
      'learned practiced reviewed'
    ).lean()

    const data = {
      learned: progress?.learned || 0,
      practiced: progress?.practiced || 0,
      reviewed: progress?.reviewed || 0,
    }

    res.json({ data })
  } catch (err) {
    next(err)
  }
}

/**
 * Increment daily progress counters
 */
async function incrementDailyProgress(req, res, next) {
  try {
    const userId = req.user._id
    const {
      date,
      learnedDelta = 0,
      practicedDelta = 0,
      reviewedDelta = 0,
    } = req.body

    if (!date) {
      return res.status(400).json({ message: 'Date parameter required' })
    }

    // Validate date format YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ message: 'Invalid date format' })
    }

    // Build increment update based on provided deltas
    const inc = {}
    if (learnedDelta > 0) inc.learned = learnedDelta
    if (practicedDelta > 0) inc.practiced = practicedDelta
    if (reviewedDelta > 0) inc.reviewed = reviewedDelta

    // Only update if there are increments
    if (Object.keys(inc).length === 0) {
      return res.json({ ok: true })
    }

    await DailyProgress.findOneAndUpdate(
      { user: userId, date },
      { $inc: inc },
      {
        upsert: true,
        new: true,
      }
    )

    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
}

/**
 * Mark a batch of words as reviewed now by bumping their lastSeenAt.
 * This prevents the same words from being immediately selected again for review.
 */
async function markReviewedBatch(req, res, next) {
  try {
    const userId = req.user._id
    const { items } = req.body || {}

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Invalid payload' })
    }

    const ids = Array.from(
      new Set(
        items
          .map((it) => String(it.itemId || it.id || ''))
          .filter((id) => id && id !== 'undefined')
      )
    )

    if (ids.length === 0) {
      return res.json({ ok: true })
    }

    const ops = ids.map((itemId) => ({
      updateMany: {
        filter: { user: userId, itemId },
        update: { $set: { lastSeenAt: new Date() } },
      },
    }))

    await UserWordProgress.bulkWrite(ops, { ordered: false })

    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
}

module.exports = {
  markLearnedBatch,
  summaryByCategory,
  listLearned,
  getActivityDays,
  getReviewReadyCount,
  getDailyProgress,
  incrementDailyProgress,
  markReviewedBatch,
}
