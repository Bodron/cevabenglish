const { validationResult } = require('express-validator')
const User = require('../models/User')
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} = require('../utils/generateTokens')

function handleValidation(req, res) {
  const errors = validationResult(req)
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() })
  }
  return null
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
    user: { _id: user._id, username: user.username, email: user.email },
    accessToken,
    refreshToken,
  })
}

async function login(req, res) {
  const validationError = handleValidation(req, res)
  if (validationError) return

  const { email, password } = req.body
  const user = await User.findOne({ email }).select('+password username email')
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials' })
  }

  const valid = await user.comparePassword(password)
  if (!valid) {
    return res.status(401).json({ message: 'Invalid credentials' })
  }

  const accessToken = generateAccessToken(user._id)
  const refreshToken = generateRefreshToken(user._id)

  return res.json({
    user: { _id: user._id, username: user.username, email: user.email },
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
    const user = await User.findById(userId).select('_id username email')
    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' })
    }
    // Generate new tokens (best practice: rotate refresh token too)
    const newAccessToken = generateAccessToken(user._id)
    const newRefreshToken = generateRefreshToken(user._id)

    return res.json({
      user: { _id: user._id, username: user.username, email: user.email },
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    })
  } catch {
    return res.status(401).json({ message: 'Unauthorized' })
  }
}

async function me(req, res) {
  return res.json({ user: req.user })
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

module.exports = {
  register,
  login,
  refresh,
  me,
  logout,
}
