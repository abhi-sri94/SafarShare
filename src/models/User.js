const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Core identity
  firstName:   { type: String, required: true, trim: true, maxlength: 50 },
  lastName:    { type: String, required: true, trim: true, maxlength: 50 },
  phone:       { type: String, required: true, unique: true, trim: true },
  email:       { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:    { type: String, required: true, minlength: 8, select: false },
  role:        { type: String, enum: ['passenger', 'driver', 'both', 'admin'], default: 'passenger' },
  activeRole:  { type: String, enum: ['passenger', 'driver'], default: 'passenger' },

  // Profile
  profilePhoto:  { type: String, default: null },
  city:          { type: String, trim: true },
  dateOfBirth:   { type: Date },
  gender:        { type: String, enum: ['male', 'female', 'other', 'prefer_not_to_say'] },
  bio:           { type: String, maxlength: 200 },

  // Verification status
  isPhoneVerified: { type: Boolean, default: false },
  isEmailVerified: { type: Boolean, default: false },
  isAadhaarVerified: { type: Boolean, default: false },
  isDriverApproved:  { type: Boolean, default: false },
  isBanned:          { type: Boolean, default: false },
  banReason:         { type: String },

  // Driver-specific info
  driverInfo: {
    vehicleModel:    { type: String },
    vehicleNumber:   { type: String, uppercase: true },
    vehicleColor:    { type: String },
    vehicleType:     { type: String, enum: ['hatchback', 'sedan', 'suv', 'mpv'] },
    aadhaarNumber:   { type: String, select: false },
    aadhaarDoc:      { type: String }, // Cloudinary URL
    licenseNumber:   { type: String },
    licenseDoc:      { type: String }, // Cloudinary URL
    licenseExpiry:   { type: Date },
    rcNumber:        { type: String },
    rcDoc:           { type: String }, // Cloudinary URL
    insuranceDoc:    { type: String },
    isOnline:        { type: Boolean, default: false },
    currentLocation: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
    },
  },

  // Ratings
  passengerRating: { type: Number, default: 5.0, min: 1, max: 5 },
  driverRating:    { type: Number, default: 5.0, min: 1, max: 5 },
  totalRatings:    { type: Number, default: 0 },

  // Stats
  totalRides:      { type: Number, default: 0 },
  totalEarnings:   { type: Number, default: 0 },
  totalSavings:    { type: Number, default: 0 },

  // Emergency contacts
  emergencyContacts: [{
    name:  { type: String, required: true },
    phone: { type: String, required: true },
    relation: { type: String },
  }],

  // Payment methods saved
  savedUpiId:  { type: String },
  walletBalance: { type: Number, default: 0 },

  // FCM token for push notifications
  fcmToken: { type: String },

  // Auth tokens
  passwordResetToken:   { type: String, select: false },
  passwordResetExpires: { type: Date, select: false },
  emailVerifyToken:     { type: String, select: false },
  refreshToken:         { type: String, select: false },

  // Preferences
  preferences: {
    language:    { type: String, default: 'hi' },
    notifications: { type: Boolean, default: true },
    shareLocation: { type: Boolean, default: true },
  },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Indexes
userSchema.index({ phone: 1 });
userSchema.index({ email: 1 });
userSchema.index({ 'driverInfo.currentLocation': '2dsphere' });
userSchema.index({ isBanned: 1, isDriverApproved: 1 });

// Virtual: full name
userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual: initials
userSchema.virtual('initials').get(function () {
  return `${this.firstName[0]}${this.lastName[0]}`.toUpperCase();
});

// Hash password before save
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Update driver rating
userSchema.methods.updateDriverRating = async function (newRating) {
  const total = this.totalRatings;
  this.driverRating = ((this.driverRating * total) + newRating) / (total + 1);
  this.totalRatings += 1;
  await this.save();
};

module.exports = mongoose.model('User', userSchema);
