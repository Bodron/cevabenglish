const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 12)

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 30,
      unique: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },
    resetToken: {
      type: String,
      index: true,
      sparse: true,
    },
    resetExpires: {
      type: Date,
    },
    avatarUrl: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true }
)

userSchema.pre('save', async function preSave(next) {
  if (!this.isModified('password')) {
    return next()
  }
  const salt = await bcrypt.genSalt(SALT_ROUNDS)
  this.password = await bcrypt.hash(this.password, salt)
  next()
})

userSchema.methods.comparePassword = async function comparePassword(
  candidatePassword
) {
  return bcrypt.compare(candidatePassword, this.password)
}

const User = mongoose.model('User', userSchema)

module.exports = User
