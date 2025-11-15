const jwt = require('jsonwebtoken')

function getEnvOrThrow(key) {
  const value = process.env[key]
  if (!value) {
    throw new Error(`${key} is not set in environment variables`)
  }
  return value
}

function parseExpires(value, fallback) {
  if (!value) return fallback
  const trimmed = String(value).trim()
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed)
  }
  if (/^\d+\s*[smhd]$/i.test(trimmed)) {
    return trimmed.replace(/\s+/g, '')
  }
  console.warn(
    `Invalid TTL format "${value}". Falling back to default value "${fallback}".`
  )
  return fallback
}

function generateAccessToken(userId) {
  const secret = getEnvOrThrow('JWT_ACCESS_SECRET')
  const expiresIn = parseExpires(process.env.ACCESS_TOKEN_TTL, '15m')
  return jwt.sign({ sub: String(userId), type: 'access' }, secret, {
    expiresIn,
    issuer: 'benglish-api',
  })
}

function generateRefreshToken(userId) {
  const secret = getEnvOrThrow('JWT_REFRESH_SECRET')
  const expiresIn = parseExpires(process.env.REFRESH_TOKEN_TTL, '7d')
  return jwt.sign({ sub: String(userId), type: 'refresh' }, secret, {
    expiresIn,
    issuer: 'benglish-api',
  })
}

function verifyAccessToken(token) {
  const secret = getEnvOrThrow('JWT_ACCESS_SECRET')
  return jwt.verify(token, secret, { issuer: 'benglish-api' })
}

function verifyRefreshToken(token) {
  const secret = getEnvOrThrow('JWT_REFRESH_SECRET')
  return jwt.verify(token, secret, { issuer: 'benglish-api' })
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
}
