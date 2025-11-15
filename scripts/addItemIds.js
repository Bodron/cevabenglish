const path = require('path')
const mongoose = require('mongoose')

require('dotenv').config({
  path: path.resolve(__dirname, '../.env'),
})

const { connectDB } = require('../src/config/db')
const WordCategory = require('../src/models/WordCategory')

function parseArgs() {
  const args = process.argv.slice(2)
  return {
    dryRun: args.includes('--dry-run') || args.includes('-n'),
    batchSize: Number(
      args.find((a) => a.startsWith('--batch='))?.split('=')[1] || 200
    ),
    verbose: args.includes('--verbose') || args.includes('-v'),
  }
}

async function backfillItemIds() {
  const { dryRun, batchSize, verbose } = parseArgs()
  await connectDB()

  const cursor = WordCategory.find({}, { items: 1 })
    .lean()
    .cursor({ batchSize })

  let inspected = 0
  let updated = 0
  let missingTotal = 0

  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    inspected++

    const items = Array.isArray(doc.items) ? [...doc.items] : []
    let changed = false
    let missing = 0

    for (let i = 0; i < items.length; i++) {
      if (!items[i]._id) {
        missing++
        items[i] = { ...items[i], _id: new mongoose.Types.ObjectId() }
        changed = true
      }
    }

    if (missing > 0) {
      missingTotal += missing
      if (verbose) {
        console.log(`- Category ${doc._id}: items without _id = ${missing}`)
      }
    }

    if (changed && !dryRun) {
      const res = await WordCategory.updateOne(
        { _id: doc._id },
        { $set: { items } }
      )
      if (res.modifiedCount > 0) updated++
    }
  }

  console.log(
    `Done. Categories inspected: ${inspected}, categories updated: ${updated}, items missing ids: ${missingTotal}${
      dryRun ? ' (dry-run)' : ''
    }`
  )

  await mongoose.disconnect()
}

backfillItemIds().catch((err) => {
  console.error('Migration failed:', err)
  process.exitCode = 1
})
