const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { sendOTP, verifyOTP } = require('../services/twilioService');
const { protect } = require('../middleware/auth');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const router = express.Router();

const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
const signRefreshToken = (id) => jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN });

const sendTokens = (user, statusCode, res) => {
  const token = signToken(user._id);
  const refreshToken = signRefreshToken(user._id);
  user.password = undefined;
  res.status(statusCode).json({
    success: true,
    token,
    refreshToken,
    data: { user },
  });
};

// ── POST /api/auth/send-otp ────────────────────────────────────────────────
router.post('/send-otp', [
  body('phone').matches(/^\+91[6-9]\d{9}$/).withMessage('Enter a valid Indian mobile number starting with +91'),
  body('purpose').isIn(['register', 'login', 'reset_password']).withMessage('Invalid OTP purpose'),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { phone, purpose } = req.body;

    if (purpose === 'register') {
      const existing = await User.findOne({ phone });
      if (existing) return next(new AppError('This phone number is already registered. Please log in.', 409));
    }

    if (purpose === 'login') {
      const existing = await User.findOne({ phone });
      if (!existing) return next(new AppError('No account found with this number. Please register.', 404));
    }

    await sendOTP(phone, purpose);
    res.json({ success: true, message: `OTP sent to ${phone}` });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/auth/register ────────────────────────────────────────────────
router.post('/register', [
  body('firstName').trim().isLength({ min: 2, max: 50 }).withMessage('First name must be 2-50 characters'),
  body('lastName').trim().isLength({ min: 1, max: 50 }).withMessage('Last name required'),
  body('phone').matches(/^\+91[6-9]\d{9}$/).withMessage('Valid Indian mobile required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits'),
  body('role').isIn(['passenger', 'driver', 'both']).withMessage('Role must be passenger, driver or both'),
  body('city').notEmpty().withMessage('City is required'),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { firstName, lastName, phone, email, password, otp, role, city, vehicleModel, vehicleNumber } = req.body;

    // Check duplicates
    const existing = await User.findOne({ $or: [{ phone }, { email }] });
    if (existing) {
      const field = existing.phone === phone ? 'phone number' : 'email';
      return next(new AppError(`This ${field} is already registered.`, 409));
    }

    // Verify OTP
    const otpResult = await verifyOTP(phone, otp, 'register');
    if (!otpResult.success) return next(new AppError(otpResult.message, 400));

    // Create user
    const userData = { firstName, lastName, phone, email, password, role, city, isPhoneVerified: true };

    if ((role === 'driver' || role === 'both') && vehicleModel) {
      userData.driverInfo = { vehicleModel, vehicleNumber };
    }

    const user = await User.create(userData);
    logger.info(`New user registered: ${user._id} (${role})`);
    sendTokens(user, 201, res);
  } catch (error) {
    next(error);
  }
});

// ── POST /api/auth/login ───────────────────────────────────────────────────
router.post('/login', [
  body('phone').matches(/^\+91[6-9]\d{9}$/).withMessage('Valid Indian mobile required'),
  body('password').notEmpty().withMessage('Password required'),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { phone, password, fcmToken } = req.body;

    const user = await User.findOne({ phone }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      return next(new AppError('Incorrect phone number or password.', 401));
    }

    if (user.isBanned) return next(new AppError('Your account has been suspended. Contact support@safarshare.in', 403));

    // Update FCM token if provided
    if (fcmToken) await User.findByIdAndUpdate(user._id, { fcmToken });

    logger.info(`User logged in: ${user._id}`);
    sendTokens(user, 200, res);
  } catch (error) {
    next(error);
  }
});

// ── POST /api/auth/login-otp ──────────────────────────────────────────────
router.post('/login-otp', [
  body('phone').matches(/^\+91[6-9]\d{9}$/).withMessage('Valid Indian mobile required'),
  body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits'),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { phone, otp, fcmToken } = req.body;
    const otpResult = await verifyOTP(phone, otp, 'login');
    if (!otpResult.success) return next(new AppError(otpResult.message, 400));

    const user = await User.findOne({ phone });
    if (!user) return next(new AppError('User not found. Please register.', 404));
    if (user.isBanned) return next(new AppError('Your account has been suspended.', 403));

    if (fcmToken) await User.findByIdAndUpdate(user._id, { fcmToken });

    sendTokens(user, 200, res);
  } catch (error) {
    next(error);
  }
});

// ── POST /api/auth/refresh-token ──────────────────────────────────────────
router.post('/refresh-token', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return next(new AppError('Refresh token required.', 400));

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id);
    if (!user) return next(new AppError('User not found.', 401));

    const newToken = signToken(user._id);
    res.json({ success: true, token: newToken });
  } catch (error) {
    next(new AppError('Invalid or expired refresh token. Please log in again.', 401));
  }
});

// ── POST /api/auth/forgot-password ────────────────────────────────────────
router.post('/forgot-password', [
  body('phone').matches(/^\+91[6-9]\d{9}$/).withMessage('Valid Indian mobile required'),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { phone } = req.body;
    const user = await User.findOne({ phone });
    if (!user) return next(new AppError('No account found with this number.', 404));

    await sendOTP(phone, 'reset_password');
    res.json({ success: true, message: 'Password reset OTP sent.' });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/auth/reset-password ─────────────────────────────────────────
router.post('/reset-password', [
  body('phone').matches(/^\+91[6-9]\d{9}$/).withMessage('Valid phone required'),
  body('otp').isLength({ min: 6, max: 6 }),
  body('newPassword').isLength({ min: 8 }).withMessage('Password must be 8+ characters'),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { phone, otp, newPassword } = req.body;
    const otpResult = await verifyOTP(phone, otp, 'reset_password');
    if (!otpResult.success) return next(new AppError(otpResult.message, 400));

    const user = await User.findOne({ phone });
    if (!user) return next(new AppError('User not found.', 404));

    user.password = newPassword;
    await user.save();

    res.json({ success: true, message: 'Password reset successfully. Please log in.' });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/auth/me ───────────────────────────────────────────────────────
router.get('/me', protect, async (req, res) => {
  const user = await User.findById(req.user._id);
  res.json({ success: true, data: { user } });
});

// ── POST /api/auth/logout ──────────────────────────────────────────────────
router.post('/logout', protect, async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { fcmToken: null });
  res.json({ success: true, message: 'Logged out successfully.' });
});

module.exports = router;
