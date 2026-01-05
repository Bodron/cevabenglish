const UserWordProgress = require('../models/UserWordProgress')
const WordCategory = require('../models/WordCategory')
const DailyProgress = require('../models/DailyProgress')

async function markLearnedBatch(req, res, next) {
  try {
    const userId = req.user._id
    const { categoryId, items, source = 'learned' } = req.body || {}
    // source: 'known' pentru "Știu deja", 'learned' pentru "Învățat"

    console.log('[markLearnedBatch] Received:', {
      userId: userId.toString(),
      categoryId,
      itemsCount: items?.length || 0,
      source, // Log source-ul primit
    })

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
            $set: {
              status: 'learned',
              source: source, // Adăugăm source aici
              lastSeenAt: new Date(),
            },
            $inc: { correctStreak: 1 },
          },
          upsert: true,
        },
      }
    })

    console.log(
      '[markLearnedBatch] Will update with source:',
      source,
      'for',
      ops.length,
      'items'
    )

    await UserWordProgress.bulkWrite(ops, { ordered: false })

    console.log(
      '[markLearnedBatch] Successfully marked',
      ops.length,
      'items with source:',
      source
    )

    res.json({ ok: true })
  } catch (err) {
    console.error('[markLearnedBatch] Error:', err)
    next(err)
  }
}

async function summaryByCategory(req, res, next) {
  try {
    const userId = req.user._id
    // Pentru "Știu deja" - numără cuvintele cu source: 'known' SAU fără source (cuvintele vechi)
    const query = {
      user: userId,
      status: 'learned',
      $or: [
        { source: 'known' },
        { source: { $exists: false } },
        { source: null },
      ],
    }

    console.log(
      '[summaryByCategory] Query for "Știu deja":',
      JSON.stringify(query)
    )

    const data = await UserWordProgress.aggregate([
      { $match: query },
      { $group: { _id: '$category', learned: { $sum: 1 } } },
    ])

    const total = data.reduce((sum, item) => sum + item.learned, 0)
    console.log(
      '[summaryByCategory] Found',
      total,
      'words for "Știu deja" across',
      data.length,
      'categories'
    )

    res.json({ data })
  } catch (err) {
    console.error('[summaryByCategory] Error:', err)
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

    console.log(
      '[getReviewReadyCount] Request from user:',
      userId.toString(),
      'countOnly:',
      countOnly
    )

    // Words are ready for review if:
    // 1. Status is 'learned'
    // 2. Source is 'learned' (nu 'known' - cele marcate ca "Știu deja")
    // NU mai avem condiția de 24 ore - cuvintele învățate apar imediat la "Repetare"

    if (countOnly === '1') {
      const query = {
        user: userId,
        status: 'learned',
        source: 'learned', // DOAR cele cu source: 'learned', nu cele fără source
      }
      console.log('[getReviewReadyCount] Count query:', JSON.stringify(query))

      const count = await UserWordProgress.countDocuments(query)

      console.log('[getReviewReadyCount] Found count:', count)

      return res.json({ data: { count } })
    }

    const targetSize = 20 // Target: 20 cuvinte pentru sesiune
    const maxSize = Math.min(Number(limit) || 100, 200)

    // Pasul 1: Ia cuvintele cu source: 'learned' (prioritizând cele dificil)
    const learnedQuery = {
      user: userId,
      status: 'learned',
      source: 'learned', // DOAR cele cu source: 'learned'
    }

    console.log(
      '[getReviewReadyCount] Find query for "learned":',
      JSON.stringify(learnedQuery)
    )

    let words = await UserWordProgress.find(
      learnedQuery,
      'category itemId english romanian lastSeenAt difficultCount source'
    )
      .sort({ difficultCount: -1, lastSeenAt: 1 }) // Dificil primul, apoi cele mai vechi
      .limit(maxSize)
      .lean()

    console.log(
      '[getReviewReadyCount] Found',
      words.length,
      'words with source: "learned"'
    )

    // Pasul 2: Dacă nu sunt suficiente, completează cu cuvinte de la "Știu deja"
    if (words.length < targetSize) {
      const needed = targetSize - words.length
      const knownQuery = {
        user: userId,
        status: 'learned',
        $or: [
          { source: 'known' },
          { source: { $exists: false } },
          { source: null },
        ],
        // Exclude cuvintele deja adăugate
        itemId: { $nin: words.map((w) => w.itemId) },
      }

      console.log(
        '[getReviewReadyCount] Need',
        needed,
        'more words, fetching from "Știu deja"'
      )

      const knownWords = await UserWordProgress.find(
        knownQuery,
        'category itemId english romanian lastSeenAt difficultCount source'
      )
        .sort({ lastSeenAt: 1 }) // Cele mai vechi primul
        .limit(needed)
        .lean()

      console.log(
        '[getReviewReadyCount] Found',
        knownWords.length,
        'words from "Știu deja" to complete'
      )

      words = [...words, ...knownWords]
    }

    // Limitează la targetSize (20) sau maxSize
    words = words.slice(0, Math.min(targetSize, maxSize))

    console.log(
      '[getReviewReadyCount] Final result:',
      words.length,
      'words for review'
    )
    if (words.length > 0) {
      console.log('[getReviewReadyCount] First word sample:', {
        itemId: words[0].itemId,
        source: words[0].source,
        difficultCount: words[0].difficultCount,
      })
    }

    res.json({ data: words })
  } catch (err) {
    console.error('[getReviewReadyCount] Error:', err)
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

/**
 * Get difficult words count - returns count of words with difficultCount >= 2
 */
async function getDifficultCount(req, res, next) {
  try {
    const userId = req.user._id
    // Cuvinte dificil = cuvinte cu difficultCount >= 2
    const count = await UserWordProgress.countDocuments({
      user: userId,
      difficultCount: { $gte: 2 },
    })
    res.json({ data: { count } })
  } catch (err) {
    next(err)
  }
}

/**
 * Mark a word as having a wrong answer - increments difficultCount
 */
async function markWrongAnswer(req, res, next) {
  try {
    const userId = req.user._id
    const { categoryId, itemId } = req.body || {}
    if (!categoryId || !itemId) {
      return res.status(400).json({ message: 'Invalid payload' })
    }

    await UserWordProgress.findOneAndUpdate(
      { user: userId, category: categoryId, itemId: String(itemId) },
      { $inc: { difficultCount: 1 } },
      { upsert: false } // Nu creăm dacă nu există
    )

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
  getDifficultCount,
  markWrongAnswer,
}
