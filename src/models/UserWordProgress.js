const mongoose = require('mongoose')

const userWordProgressSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WordCategory',
      required: true,
      index: true,
    },
    itemId: { type: mongoose.Schema.Types.ObjectId, required: true },

    // denormalized fields for convenience
    english: { type: String, trim: true },
    romanian: { type: String, trim: true },

    status: {
      type: String,
      enum: ['learning', 'learned'],
      default: 'learned',
      index: true,
    },
    correctStreak: { type: Number, default: 0 },
    learnedAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
)

userWordProgressSchema.index(
  { user: 1, category: 1, itemId: 1 },
  { unique: true }
)

module.exports = mongoose.model('UserWordProgress', userWordProgressSchema)
