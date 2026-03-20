const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  phone:     { type: String, required: true },
  otp:       { type: String, required: true },
  purpose:   { type: String, enum: ['login', 'register', 'reset_password', 'verify_phone'], required: true },
  attempts:  { type: Number, default: 0 },
  isUsed:    { type: Boolean, default: false },
  expiresAt: { type: Date, required: true },
}, {
  timestamps: true,
});

// Auto-expire OTP documents
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
otpSchema.index({ phone: 1, purpose: 1 });

module.exports = mongoose.model('OTP', otpSchema);
