const { validationResult } = require('express-validator')
const User = require('../models/User')
// awsUpload este scris în stil ESM (default export), dar aici folosim CommonJS.
// Pentru a fi compatibil cu ambele stiluri, luăm fie exportul default, fie modulul în sine.
const awsUpload = require('../utils/awsUpload')
const uploadToS3 = awsUpload.default || awsUpload
const { deleteFromS3 } = awsUpload
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} = require('../utils/generateTokens')
const nodemailer = require('nodemailer')
const { OAuth2Client } = require('google-auth-library')

function handleValidation(req, res) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() })
  }
  return null
}

// --- Mailer singleton (reuse pooled transporter across requests) ---
const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com'
const smtpPort = Number(process.env.SMTP_PORT || 587)

const mailTransporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpPort === 465,
  requireTLS: smtpPort === 587,
  pool: true,
  maxConnections: 2,
  maxMessages: 50,
  rateDelta: 60000,
  rateLimit: 15,
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 20000,
  family: 4,
  name: 'mail.benglish.bcmenu.ro',
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    : undefined,
  tls: {
    servername: smtpHost,
    minVersion: 'TLSv1.2',
    ciphers: 'TLSv1.2',
  },
})

async function sendWithRetry(mailOptions, attempts = 5) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try {
      return await mailTransporter.sendMail(mailOptions)
    } catch (e) {
      const msg = String(e?.message || '')
      const code = e?.responseCode
      const isTemp =
        code === 421 ||
        code === 450 ||
        code === 451 ||
        code === 452 ||
        /\b421\b|4\.7\.0|ETIMEDOUT|ECONNECTION|EAI_AGAIN/i.test(msg)
      if (isTemp && i < attempts - 1) {
        const wait = Math.min(30000, 2000 * (i + 1))
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, wait))
        continue
      }
      lastErr = e
      break
    }
  }
  throw lastErr
}

async function register(req, res) {
  const validationError = handleValidation(req, res)
  if (validationError) return

  const { username, email, password } = req.body

  const existing = await User.findOne({
    $or: [{ email }, { username }],
  }).lean()
  if (existing) {
    return res.status(409).json({ message: 'Email or username already in use' })
  }

  const user = new User({ username, email, password })
  await user.save()

  const accessToken = generateAccessToken(user._id)
  const refreshToken = generateRefreshToken(user._id)

  return res.status(201).json({
    user: {
      _id: user._id,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
    },
    accessToken,
    refreshToken,
  })
}

async function login(req, res) {
  const validationError = handleValidation(req, res)
  if (validationError) return

  const { email, password } = req.body
  const user = await User.findOne({ email }).select(
    '+password username email createdAt avatarUrl disabled'
  )
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' })
  }
  if (user.disabled) {
    return res
      .status(403)
      .json({ message: 'This account has been deleted or disabled.' })
  }

  const valid = await user.comparePassword(password)
  if (!valid) {
    return res.status(401).json({ message: 'Invalid credentials' })
  }

  const accessToken = generateAccessToken(user._id)
  const refreshToken = generateRefreshToken(user._id)

  return res.json({
    user: {
      _id: user._id,
      username: user.username,
      email: user.email,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
    },
    accessToken,
    refreshToken,
  })
}

async function refresh(req, res) {
  const { refreshToken } = req.body || {}
  if (!refreshToken) {
    return res.status(400).json({ message: 'refreshToken is required' })
  }
  try {
    const payload = verifyRefreshToken(refreshToken)
    const userId = payload.sub
    const user = await User.findById(userId).select(
      '_id username email createdAt avatarUrl disabled'
    )
    if (!user || user.disabled) {
      return res.status(401).json({ message: 'Unauthorized' })
    }
    // Generate new tokens (best practice: rotate refresh token too)
    const newAccessToken = generateAccessToken(user._id)
    const newRefreshToken = generateRefreshToken(user._id)

    return res.json({
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
      },
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    })
  } catch (err) {
    return res.status(401).json({ message: 'Unauthorized' })
  }
}

async function me(req, res) {
  return res.json({ user: req.user })
}

// Soft-delete current user's account (used by in-app "Delete account" flow).
// Marks the account as disabled so it can no longer be used to login or refresh.
async function deleteAccount(req, res) {
  try {
    const userId = req.user && req.user._id
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' })
    }

    await User.findByIdAndUpdate(userId, {
      $set: { disabled: true },
      $unset: { resetToken: 1, resetExpires: 1 },
    })

    return res.status(200).json({ message: 'Account deleted' })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[auth/delete-account] error:', err)
    return res
      .status(500)
      .json({ message: 'Failed to delete account. Please try again.' })
  }
}

async function logout(req, res) {
  const { refreshToken } = req.body || {}
  if (!refreshToken) {
    return res.status(400).json({ message: 'refreshToken is required' })
  }

  try {
    verifyRefreshToken(refreshToken)
  } catch {
    // Even if token is invalid/expired, respond with success to allow clients
    // to clear local state without leaking validity information.
  }

  return res.status(200).json({ message: 'Logged out' })
}

// POST /auth/forgot - generate reset token and send email with deep link
async function forgotPassword(req, res) {
  const email = String(req.body?.email || '')
    .trim()
    .toLowerCase()
  if (!email) {
    return res.status(400).json({ message: 'Email is required' })
  }

  try {
    const user = await User.findOne({ email })
    if (!user) {
      // Do not leak if email exists or not
      // eslint-disable-next-line no-console
      console.log('[auth/forgot] user not found, not sending email:', email)
      return res.json({
        message:
          'If an account exists for this email, a reset link has been sent.',
      })
    }

    // Invalidate any previous token, then issue a new one (expires in 15 minutes)
    user.resetToken = undefined
    user.resetExpires = undefined

    const token =
      Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)

    user.resetToken = token
    user.resetExpires = new Date(Date.now() + 15 * 60 * 1000)
    await user.save()

    const fromEnv = process.env.MAIL_FROM || 'no-reply@benglish.bcmenu.ro'
    const from = fromEnv
      .replace(/.*<([^>]+)>.*/, '$1')
      .replace(/^['"]|['"]$/g, '')
      .trim()

    const appLink =
      (process.env.APP_RESET_LINK_BASE || 'benglish://reset') +
      `?token=${encodeURIComponent(token)}`
    const webLink =
      (process.env.WEB_RESET_LINK_BASE || 'https://benglish.bcmenu.ro/reset') +
      `?token=${encodeURIComponent(token)}`

    // Try sending email via CrackTheCode SMTP relay (server.crackthecodemultiplayer.com)
    const relaySecret = process.env.CRACK_API_EMAIL_TOKEN || ''
    const payload = JSON.stringify({
      to: email,
      subject: 'Resetare parolă Benglish',
      text: `Apasă pentru a reseta parola: ${webLink}`,
      html: `
        <p>Apasă pentru a reseta parola: <a href="${webLink}">Deschide în aplicație</a></p>
        <p>Acest link expiră în 15 minute și poate fi folosit o singură dată.</p>
      `,
    })

    await new Promise((resolve, reject) => {
      const https = require('https')
      const reqOptions = {
        method: 'POST',
        hostname: 'server.crackthecodemultiplayer.com',
        path: '/api/auth/internal/send-email',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'x-internal-token': relaySecret,
        },
      }

      const outReq = https.request(reqOptions, (outRes) => {
        let data = ''
        outRes.on('data', (chunk) => {
          data += chunk
        })
        outRes.on('end', () => {
          if (outRes.statusCode >= 200 && outRes.statusCode < 300) {
            // eslint-disable-next-line no-console
            console.log(
              '[auth/forgot] email relayed via CrackTheCode status=%s body=%s',
              outRes.statusCode,
              data.slice(0, 200)
            )
            resolve()
          } else {
            const snippet = data.slice(0, 200)
            reject(
              new Error(
                `Relay error status=${outRes.statusCode} body=${snippet}`
              )
            )
          }
        })
      })

      outReq.on('error', (err) => {
        reject(err)
      })

      outReq.write(payload)
      outReq.end()
    })

    return res.json({
      message:
        'If an account exists for this email, a reset link has been sent.',
      appLink,
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[auth/forgot] error sending reset email:', err)
    const msg =
      (err && err.message) || 'Failed to send password reset email. Try again.'
    return res.status(500).json({ message: msg })
  }
}

// POST /auth/change-password-temp - change password using reset token (no login)
async function changePasswordWithToken(req, res) {
  try {
    const { token, newPassword } = req.body || {}
    if (!token || !newPassword) {
      return res
        .status(400)
        .json({ message: 'Token and newPassword are required' })
    }

    const user = await User.findOne({ resetToken: token })
    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired token' })
    }

    if (!user.resetExpires || user.resetExpires.getTime() < Date.now()) {
      user.resetToken = undefined
      user.resetExpires = undefined
      try {
        await user.save()
      } catch (e) {
        // ignore save errors on cleanup
      }
      return res.status(400).json({ message: 'Invalid or expired token' })
    }

    user.password = String(newPassword)
    user.resetToken = undefined
    user.resetExpires = undefined
    await user.save()

    return res.json({ message: 'Password changed successfully' })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[auth/change-password-temp] error:', err)
    return res
      .status(500)
      .json({ message: 'Failed to change password, please try again.' })
  }
}

// PUT /auth/avatar - update user avatar image (raw bytes or data URL/base64)
async function updateAvatar(req, res) {
  try {
    let avatarUrl

    // Debug: tipul lui req.body și content-type
    try {
      console.log(
        '[AVATAR] body info',
        typeof req.body,
        req.body && req.body.constructor && req.body.constructor.name,
        req.headers['content-type']
      )
    } catch {}

    if (Buffer.isBuffer(req.body)) {
      // Flow nou: primim bytes RAW (fără base64) de la client.
      const mimeType = req.headers['content-type'] || 'application/octet-stream'
      console.log('[AVATAR] raw upload', {
        mimeType,
        size: req.body.length,
      })
      avatarUrl = await uploadToS3(req.body, 'avatar', String(mimeType))
    } else {
      // Fallback flow: JSON body cu avatarData (data URL sau raw base64)
      const avatarData =
        typeof req.body === 'string' ? req.body : req.body?.avatarData

      if (!avatarData) {
        return res.status(400).json({ message: 'Avatar data is required' })
      }

      try {
        const preview = String(avatarData).slice(0, 80)
        console.log('[AVATAR] payload preview:', preview)
      } catch {}

      avatarUrl = await uploadToS3(avatarData, 'avatar', '')
    }

    // Update user with new avatar URL
    const user = await User.findById(req.user._id)
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }

    const oldUrl = user.avatarUrl
    user.avatarUrl = avatarUrl
    await user.save()

    if (oldUrl) {
      deleteFromS3(oldUrl).catch(() => {})
    }

    return res.json({
      success: true,
      avatarUrl,
      user: {
        _id: user._id,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl,
        createdAt: user.createdAt,
      },
    })
  } catch (err) {
    console.error('Avatar update error:', err)
    return res.status(500).json({
      message: 'Failed to update avatar',
      details: err?.message || String(err),
    })
  }
}

// Creează client OAuth
// IMPORTANT: Verifică că variabilele de mediu sunt setate
const googleClientId = process.env.GOOGLE_CLIENT_ID
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET
const googleRedirectUri =
  process.env.GOOGLE_REDIRECT_URI ||
  'http://localhost:5001/api/auth/google/callback'

if (!googleClientId) {
  console.error(
    '[OAuth] ⚠️ GOOGLE_CLIENT_ID nu este setat în .env! OAuth nu va funcționa.'
  )
}

if (!googleClientSecret) {
  console.warn(
    '[OAuth] ⚠️ GOOGLE_CLIENT_SECRET nu este setat în .env! OAuth poate să nu funcționeze corect.'
  )
}

const googleClient = new OAuth2Client(
  googleClientId,
  googleClientSecret,
  googleRedirectUri
)

// Generează URL-ul pentru OAuth și face redirect
async function startGoogleOAuth(req, res) {
  try {
    if (!googleClientId) {
      return res.status(500).json({
        message:
          'Google OAuth nu este configurat. GOOGLE_CLIENT_ID lipsește din .env',
      })
    }

    console.log('[startGoogleOAuth] Client ID:', googleClientId)
    console.log('[startGoogleOAuth] Redirect URI:', googleRedirectUri)

    const redirectUrl = googleClient.generateAuthUrl({
      access_type: 'offline',
      scope: ['email', 'profile'],
      prompt: 'consent',
    })

    console.log('[startGoogleOAuth] Generated URL:', redirectUrl)

    // Redirect către Google
    res.redirect(redirectUrl)
  } catch (error) {
    console.error('[startGoogleOAuth] Error:', error)
    return res.status(500).json({ message: 'Failed to start OAuth flow' })
  }
}

// Callback de la Google - primește code, schimbă pentru tokens
async function handleGoogleCallback(req, res) {
  try {
    const { code, error } = req.query

    if (error) {
      return res.redirect(`benglish://auth?error=${encodeURIComponent(error)}`)
    }

    if (!code) {
      return res.redirect('benglish://auth?error=no_code')
    }

    // Schimbă code-ul pentru tokens
    const { tokens } = await googleClient.getToken(code)
    googleClient.setCredentials(tokens)

    // Obține informații despre user
    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    })

    const payload = ticket.getPayload()
    const { sub: googleId, email, name, picture } = payload

    if (!email) {
      return res.redirect('benglish://auth?error=no_email')
    }

    // Caută user existent după googleId sau email
    let user = await User.findOne({
      $or: [{ googleId }, { email: email.toLowerCase() }],
    })

    if (user) {
      // User existent - actualizează datele dacă e nevoie
      if (!user.googleId) {
        user.googleId = googleId
        user.googleEmail = email.toLowerCase()
        if (picture && !user.avatarUrl) {
          user.avatarUrl = picture
        }
        await user.save()
      }
    } else {
      // User nou - creează cont
      // Generează username din email dacă nu avem name
      const baseUsername = name
        ? name.toLowerCase().replace(/\s+/g, '_').substring(0, 20)
        : email.split('@')[0].substring(0, 20)

      // Asigură-te că username-ul este unic
      let username = baseUsername
      let counter = 1
      while (await User.findOne({ username })) {
        username = `${baseUsername}_${counter}`
        counter++
      }

      user = new User({
        username,
        email: email.toLowerCase(),
        googleId,
        googleEmail: email.toLowerCase(),
        avatarUrl: picture || null,
        // Nu setăm password pentru user Google
      })

      await user.save()
    }

    if (user.disabled) {
      return res.redirect('benglish://auth?error=account_disabled')
    }

    const accessToken = generateAccessToken(user._id)
    const refreshToken = generateRefreshToken(user._id)

    // Redirect către Flutter cu tokens
    const redirectUrl = `benglish://auth?accessToken=${encodeURIComponent(
      accessToken
    )}&refreshToken=${encodeURIComponent(
      refreshToken
    )}&userId=${encodeURIComponent(
      user._id.toString()
    )}&username=${encodeURIComponent(user.username)}&email=${encodeURIComponent(
      user.email
    )}`

    res.redirect(redirectUrl)
  } catch (error) {
    console.error('[handleGoogleCallback] Error:', error)
    return res.redirect('benglish://auth?error=server_error')
  }
}

module.exports = {
  register,
  login,
  refresh,
  me,
  logout,
  forgotPassword,
  changePasswordWithToken,
  updateAvatar,
  deleteAccount,
  startGoogleOAuth,
  handleGoogleCallback,
}
