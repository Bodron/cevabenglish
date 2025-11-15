const path = require('path')
const mongoose = require('mongoose')

require('dotenv').config({
  path: path.resolve(__dirname, '../.env'),
})

const { connectDB } = require('../src/config/db')
const WordCategory = require('../src/models/WordCategory')

function parseArgs() {
  const args = process.argv.slice(2)
  const getArg = (name, def) => {
    const raw = args.find((a) => a.startsWith(`--${name}=`))
    return raw ? raw.split('=').slice(1).join('=') : def
  }
  return {
    from: getArg('from', 'Café'),
    to: getArg('to', 'Cafe'),
    categories: getArg('categories', ''),
    dryRun: args.includes('--dry-run') || args.includes('-n'),
    verbose: args.includes('--verbose') || args.includes('-v'),
  }
}

function normalizeAscii(str = '') {
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

async function main() {
  const { from, to, categories, dryRun, verbose } = parseArgs()
  await connectDB()

  const filter = {}
  if (categories) {
    const ids = categories
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => new mongoose.Types.ObjectId(s))
    if (ids.length > 0) filter._id = { $in: ids }
  }

  // Scan categories (optionally filtered) and catch diacritic variants
  const cursor = WordCategory.find(filter, { category: 1, items: 1 })
    .lean()
    .cursor({ batchSize: 50 })

  let inspected = 0
  let categoriesMatched = 0
  let itemsChanged = 0
  const fromNorm = normalizeAscii(from)
  let exactCafe = 0

  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    inspected++
    let changed = false
    const items = (doc.items || []).map((it) => {
      const enNorm = normalizeAscii(it.english)
      const roNorm = normalizeAscii(it.romanian || '')
      const match =
        it.english === from || // exact
        enNorm === fromNorm || // diacritic-insensitive exact
        (enNorm === 'cafe' && roNorm.startsWith('cafene')) // handle 'Cafe' -> 'Cafenea'
      if (match) {
        if (it.english === from) exactCafe++
        changed = true
        itemsChanged++
        return { ...it, english: to }
      }
      return it
    })

    if (changed) {
      categoriesMatched++
      if (verbose) {
        const countInDoc = (doc.items || []).filter(
          (i) => i.english === from || normalizeAscii(i.english) === fromNorm
        ).length
        console.log(`- ${doc._id} (${doc.category}) -> matches ${countInDoc}`)
      }
      if (!dryRun) {
        await WordCategory.updateOne({ _id: doc._id }, { $set: { items } })
      }
    }
  }

  console.log(
    `Done. Categories inspected: ${inspected}, matched: ${categoriesMatched}, items changed: ${itemsChanged}, exact '${from}' found: ${exactCafe}${
      dryRun ? ' (dry-run)' : ''
    }`
  )

  await mongoose.disconnect()
}

main().catch((err) => {
  console.error('Replace script failed:', err)
  process.exitCode = 1
})
