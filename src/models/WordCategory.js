const mongoose = require('mongoose')

const itemSchema = new mongoose.Schema({
  // Enable per-item ids for stable references
  // NOTE: existing documents may lack _id on items; run the migration script to backfill
  english: {
    type: String,
    required: true,
    trim: true,
  },
  romanian: {
    type: String,
    required: true,
    trim: true,
  },
})

const wordCategorySchema = new mongoose.Schema(
  {
    category: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
    image: {
      type: String,
      trim: true,
      default: null,
    },
    items: {
      type: [itemSchema],
      validate: {
        validator(arr) {
          return Array.isArray(arr) && arr.length === this.total
        },
        message: 'Total must match number of items',
      },
    },
  },
  { timestamps: true }
)

const WordCategory = mongoose.model('WordCategory', wordCategorySchema)

module.exports = WordCategory
