const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../.env') })

const { connectDB } = require('../src/config/db')
const WordCategory = require('../src/models/WordCategory')

function normalizeAscii(str = '') {
  return String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function parseArgs() {
  const args = process.argv.slice(2)
  const getArg = (name, def) => {
    const raw = args.find((a) => a.startsWith(`--${name}=`))
    return raw ? raw.split('=').slice(1).join('=') : def
  }
  return {
    contains: getArg('contains', 'cafe'),
  }
}

async function main() {
  const { contains } = parseArgs()
  await connectDB()
  const cursor = WordCategory.find({}, { category: 1, items: 1 }).lean().cursor({ batchSize: 50 })

  let categories = 0
  let hits = 0
  for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
    categories++
    const matches = (doc.items || []).filter((it) =>
      normalizeAscii(it.english || '').includes(normalizeAscii(contains))
    )
    if (matches.length > 0) {
      hits += matches.length
      console.log(`- ${doc._id} (${doc.category}) : ${matches.length} matches`)
      for (const m of matches.slice(0, 3)) {
        console.log(`    • ${m.english} -> ${m.romanian}`)
      }
      if (matches.length > 3) console.log(`    ... ${matches.length - 3} more`)
    }
  }
  console.log(`Done. Categories scanned: ${categories}, total matches: ${hits}`)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

