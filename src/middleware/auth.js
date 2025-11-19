const User = require('../models/User')
const { verifyAccessToken } = require('../utils/generateTokens')

async function protect(req, res, next) {
  try {
    const authHeader = req.headers.authorization || ''
    const [scheme, token] = authHeader.split(' ')

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ message: 'Unauthorized' })
    }

    const payload = verifyAccessToken(token)
    const userId = payload.sub
    const user = await User.findById(userId).select(
      '_id username email disabled'
    )
    if (!user || user.disabled) {
      return res.status(401).json({ message: 'Unauthorized' })
    }

    req.user = user
    next()
  } catch (err) {
    return res.status(401).json({ message: 'Unauthorized' })
  }
}

module.exports = { protect }
