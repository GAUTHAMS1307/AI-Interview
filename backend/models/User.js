// models/User.js
const mongoose = require("mongoose");
const bcrypt   = require("bcryptjs");

const UserSchema = new mongoose.Schema({
  name: {
    type: String, required: true, trim: true
  },
  email: {
    type: String, required: true, unique: true,
    lowercase: true, trim: true
  },
  password: {
    type: String, required: true, minlength: 6
  },
  role: {
    type: String, enum: ["user", "admin"], default: "user"
  },
  createdAt: { type: Date, default: Date.now }
});

// Hash password before saving
UserSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Compare plain password with hashed
UserSchema.methods.matchPassword = async function (plain) {
  return await bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model("User", UserSchema);
