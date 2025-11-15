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
  const dryRun = args.includes('--dry-run')
  const fileArg = args.find((arg) => arg.startsWith('--file='))

  const filePath = fileArg
    ? path.resolve(process.cwd(), fileArg.split('=')[1])
    : path.resolve(__dirname, '../../imagescategory.json')

  return { dryRun, filePath }
}

function normalizeEntries(rawEntries) {
  if (!Array.isArray(rawEntries)) {
    throw new Error('JSON root must be an array')
  }

  const seenCategories = new Set()

  return rawEntries.map((entry, idx) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Entry at index ${idx} must be an object`)
    }

    const category =
      typeof entry.category === 'string' ? entry.category.trim() : ''
    const image = typeof entry.image === 'string' ? entry.image.trim() : ''

    if (!category) {
      throw new Error(
        `Entry at index ${idx} is missing a valid "category" field`
      )
    }
    if (!image) {
      throw new Error(
        `Entry for category "${category}" is missing a valid "image" field`
      )
    }

    try {
      const url = new URL(image)
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error('URL must use http or https')
      }
    } catch (err) {
      throw new Error(
        `Entry for category "${category}" has invalid image URL: ${err.message}`
      )
    }

    if (seenCategories.has(category)) {
      throw new Error(`Duplicate category detected: "${category}"`)
    }
    seenCategories.add(category)

    return { category, image }
  })
}

async function main() {
  const { dryRun, filePath } = parseArgs()
  console.log(
    `Updating category images from "${filePath}"${dryRun ? ' (dry run)' : ''}`
  )

  const fileContent = await fs.readFile(filePath, 'utf8')
  const normalizedEntries = normalizeEntries(JSON.parse(fileContent))

  await connectDB()

  const existingCategories = new Set(await WordCategory.distinct('category'))

  const missingCategories = []
  const operations = normalizedEntries.reduce((acc, entry) => {
    if (!existingCategories.has(entry.category)) {
      missingCategories.push(entry.category)
      return acc
    }

    acc.push({
      updateOne: {
        filter: { category: entry.category },
        update: { $set: { image: entry.image } },
      },
    })
    return acc
  }, [])

  if (operations.length === 0) {
    console.warn('No matching categories found to update.')
  } else if (dryRun) {
    console.log(
      `Dry run: would update ${operations.length} categories with image URLs. No database changes applied.`
    )
  } else {
    const result = await WordCategory.bulkWrite(operations, { ordered: false })
    console.log(
      `Update complete. Matched: ${result.matchedCount || 0}, modified: ${
        result.modifiedCount || 0
      }`
    )
  }

  if (missingCategories.length > 0) {
    console.warn(
      `Skipped ${
        missingCategories.length
      } categories because they do not exist in the database: ${missingCategories.join(
        ', '
      )}`
    )
  }
}

main()
  .catch((err) => {
    console.error('Failed to update category images', err)
    process.exitCode = 1
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect()
    }
    process.exit()
  })
