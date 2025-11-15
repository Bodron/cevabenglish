const mongoose = require('mongoose')

let isConnected = false

async function connectDB() {
  if (isConnected) {
    return
  }

  const mongoUri = process.env.MONGODB_URI
  if (!mongoUri) {
    throw new Error('MONGODB_URI is not set in environment variables')
  }

  mongoose.set('strictQuery', true)

  await mongoose.connect(mongoUri, {
    autoIndex: false,
    serverSelectionTimeoutMS: 5000,
  })

  isConnected = true
  // eslint-disable-next-line no-console
  console.log('✓ MongoDB connected')
}

module.exports = { connectDB }
