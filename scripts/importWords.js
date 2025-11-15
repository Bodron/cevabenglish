const path = require('path')
const fs = require('fs/promises')
const mongoose = require('mongoose')

require('dotenv').config({
  path: path.resolve(__dirname, '../.env'),
})

const { connectDB } = require('../src/config/db')
const WordCategory = require('../src/models/WordCategory')

function parseArgs() {
  const args = process.argv.slice(2)
  const reset = args.includes('--reset')
  const fileArg = args.find((arg) => arg.startsWith('--file='))
  const rawPath = fileArg ? fileArg.split('=')[1] : null
  const filePath = rawPath
    ? path.resolve(process.cwd(), rawPath)
    : path.resolve(__dirname, '../../englishwords.json')

  return { reset, filePath }
}

function normalizeEntries(entries) {
  if (!Array.isArray(entries)) {
    throw new Error('JSON root must be an array of categories')
  }

  let totalWords = 0

  const normalized = entries.map((entry, idx) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Entry at index ${idx} must be an object`)
    }

    const { category, total, items } = entry
    if (typeof category !== 'string' || !category.trim()) {
      throw new Error(`Entry at index ${idx} has invalid category`)
    }
    if (!Array.isArray(items)) {
      throw new Error(`Entry at index ${idx} must include an items array`)
    }

    const cleanedItems = items.map((item, itemIdx) => {
      if (!item || typeof item !== 'object') {
        throw new Error(
          `Item at index ${itemIdx} in category "${category}" must be an object`
        )
      }
      const { english, romanian } = item
      if (typeof english !== 'string' || !english.trim()) {
        throw new Error(
          `Item at index ${itemIdx} in category "${category}" must include an english field`
        )
      }
      if (typeof romanian !== 'string' || !romanian.trim()) {
        throw new Error(
          `Item at index ${itemIdx} in category "${category}" must include a romanian field`
        )
      }
      return {
        english: english.trim(),
        romanian: romanian.trim(),
      }
    })

    const computedTotal = cleanedItems.length
    if (typeof total === 'number' && total !== computedTotal) {
      console.warn(
        `Total mismatch for category "${category}". Expected ${total}, found ${computedTotal}. Using computed value.`
      )
    }
    totalWords += computedTotal

    return {
      category: category.trim(),
      total: computedTotal,
      items: cleanedItems,
    }
  })

  return {
    normalized,
    totalCategories: normalized.length,
    totalWords,
  }
}

async function main() {
  const { reset, filePath } = parseArgs()
  console.log(`Importing words from "${filePath}"${reset ? ' with reset' : ''}`)

  const fileContent = await fs.readFile(filePath, 'utf8')
  const rawEntries = JSON.parse(fileContent)
  const {
    normalized: entries,
    totalCategories,
    totalWords,
  } = normalizeEntries(rawEntries)

  console.log(
    `Validated input: ${totalCategories} categories, ${totalWords} total words (items across categories)`
  )

  await connectDB()

  if (reset) {
    const deleted = await WordCategory.deleteMany({})
    console.log(`Removed ${deleted.deletedCount} existing categories`)
  }

  const operations = entries.map((entry) => ({
    updateOne: {
      filter: { category: entry.category },
      update: { $set: entry },
      upsert: true,
    },
  }))

  const result = await WordCategory.bulkWrite(operations, { ordered: false })
  console.log(
    `Import complete. Upserted: ${result.upsertedCount || 0}, modified: ${
      result.modifiedCount || 0
    }`
  )
}

main()
  .catch((err) => {
    console.error('Import failed', err)
    process.exitCode = 1
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect()
    }
    process.exit()
  })
