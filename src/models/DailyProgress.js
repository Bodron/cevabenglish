const mongoose = require('mongoose')

const dailyProgressSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    date: {
      type: String, // YYYY-MM-DD format
      required: true,
      index: true,
    },
    learned: { type: Number, default: 0 },
    practiced: { type: Number, default: 0 },
    reviewed: { type: Number, default: 0 },
  },
  { timestamps: true }
)

// Compound index pentru queries rapide
dailyProgressSchema.index({ user: 1, date: 1 }, { unique: true })

module.exports = mongoose.model('DailyProgress', dailyProgressSchema)
