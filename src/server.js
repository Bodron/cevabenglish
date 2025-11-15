require('dotenv').config()
const express = require('express')
const helmet = require('helmet')
const cors = require('cors')
const rateLimit = require('express-rate-limit')
const mongoSanitize = require('@exortek/express-mongo-sanitize')
const hpp = require('hpp')
const morgan = require('morgan')
const { connectDB } = require('./config/db')

const authRoutes = require('./routes/auth')
const categoryRoutes = require('./routes/categories')
const progressRoutes = require('./routes/progress')

const app = express()

app.disable('x-powered-by')

if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'))
}

app.set('trust proxy', 1)

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
})
app.use(globalLimiter)

app.use(express.json({ limit: '10kb' }))

app.use(helmet())
app.use(mongoSanitize())
app.use(hpp())

const corsOrigins = (process.env.CORS_ORIGIN || '').split(',').filter(Boolean)
app.use(
  cors({
    origin: corsOrigins.length > 0 ? corsOrigins : undefined,
    credentials: false,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
)

app.get('/health', (req, res) => res.json({ status: 'ok' }))

app.use('/api/auth', authRoutes)
app.use('/api/categories', categoryRoutes)
app.use('/api/progress', progressRoutes)

app.use((req, res) => res.status(404).json({ message: 'Not found' }))

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error(err)
  res.status(500).json({ message: 'Internal server error' })
})

async function start() {
  const port = Number(process.env.PORT || 5001)
  await connectDB()
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`✓ Server running on port ${port}`)
  })
}

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server', err)
  process.exit(1)
})
