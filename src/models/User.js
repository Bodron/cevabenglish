const mongoose = require('mongoose')
const bcrypt = require('bcryptjs')

const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 12)

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: function () {
        // Username este obligatoriu doar dacă nu e login cu Google
        return !this.googleId
      },
      trim: true,
      minlength: 3,
      maxlength: 30,
      unique: true,
      sparse: true, // Permite null, dar dacă există, trebuie să fie unic
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
      required: function () {
        // Parola este obligatorie doar dacă nu e login cu Google
        return !this.googleId
      },
      minlength: 8,
      select: false,
    },
    // Adăugăm câmpuri pentru Google OAuth
    googleId: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },
    googleEmail: {
      type: String,
      trim: true,
      lowercase: true,
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
    // Când un utilizator își șterge contul din aplicație,
    // îl marcăm ca disabled pentru a bloca login-ul și refresh-ul.
    disabled: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
)

userSchema.pre('save', async function preSave(next) {
  // Dacă e user Google și nu are parolă, skip
  if (this.googleId && !this.password) {
    return next()
  }
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
