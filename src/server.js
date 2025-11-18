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
const activityRoutes = require('./routes/activity')
const reviewRoutes = require('./routes/review')
const dailyProgressRoutes = require('./routes/dailyProgress')

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

// Accept larger payloads (e.g. base64 avatar images), similar cu serverul Voucherino
app.use(express.json({ limit: '10mb' }))
// Doar text/* - nu mai interceptăm application/octet-stream aici,
// ca să lăsăm express.raw din ruta /api/auth/avatar să primească bytes.
app.use(
  express.text({
    limit: '10mb',
    type: ['text/*'],
  })
)

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

// Deep-link redirector: opens the app via custom scheme from an HTTPS link
app.get(['/link/reset', '/reset'], (req, res) => {
  try {
    const token = encodeURIComponent(String(req.query.token || ''))
    const appUrl = `benglish://reset?token=${token}`
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Open Benglish</title>
  <style>body{background:#020817;color:#e5e7eb;font-family:-apple-system,system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;padding:24px;text-align:center}a.btn{display:inline-block;margin-top:16px;padding:12px 18px;border:1px solid rgba(148,163,184,.5);border-radius:12px;color:#e5e7eb;text-decoration:none;background:rgba(15,23,42,.9)}</style>
  <script>
    function openApp(){ window.location.href='${appUrl}'; }
    document.addEventListener('DOMContentLoaded', function(){
      // try auto-open; some in-app browsers block this, but keep the button active
      openApp();
      setTimeout(openApp, 800);
      setTimeout(function(){ var fb=document.getElementById('fb'); if(fb) fb.style.display='block'; }, 1200);
    });
  </script>
</head>
<body>
  <h3>Deschidem Benglish…</h3>
  <a class="btn" href="${appUrl}">Deschide în aplicație</a>
  <p id="fb" style="display:none;margin-top:10px;opacity:.8">Dacă nu se întâmplă nimic, apasă butonul de mai sus.</p>
</body>
</html>`)
  } catch (err) {
    res.status(400).send('Invalid link')
  }
})

app.use('/api/auth', authRoutes)
app.use('/api/categories', categoryRoutes)
app.use('/api/progress', progressRoutes)
app.use('/api/activity', activityRoutes)
app.use('/api/review', reviewRoutes)
app.use('/api/daily-progress', dailyProgressRoutes)

app.use((req, res) => res.status(404).json({ message: 'Not found' }))

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error(err)
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({
      message: 'Payload too large',
      details: err.message,
    })
  }
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
