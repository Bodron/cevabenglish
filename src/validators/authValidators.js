const { body } = require('express-validator')

const usernameRule = body('username')
  .trim()
  .isLength({ min: 3, max: 30 })
  .withMessage('Username must be 3-30 characters')
  .matches(/^[a-zA-Z0-9_]+$/)
  .withMessage('Username can contain letters, numbers, and underscore only')

const emailRule = body('email')
  .trim()
  .isEmail()
  .withMessage('Invalid email')
  .normalizeEmail()

const passwordRule = body('password')
  .isLength({ min: 4 })
  .withMessage('Password must be at least 4 characters long')

const confirmPasswordRule = body('confirmPassword')
  .custom((value, { req }) => value === req.body.password)
  .withMessage('Passwords do not match')

const registerValidator = [
  usernameRule,
  emailRule,
  passwordRule,
  confirmPasswordRule,
]

const loginValidator = [
  emailRule,
  body('password').exists().withMessage('Password is required'),
]

module.exports = {
  registerValidator,
  loginValidator,
}
