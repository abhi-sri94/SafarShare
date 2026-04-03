const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const supabase = require('../config/supabase');
const { sendOTP, verifyOTP } = require('../services/twilioService');
const { protect } = require('../middleware/auth');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { admin } = require('../services/firebaseService');

const router = express.Router();

const signToken = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
const signRefreshToken = (id) => jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN });

const sendTokens = (user, statusCode, res) => {
  const token = signToken(user.id);
  const refreshToken = signRefreshToken(user.id);
  delete user.password;
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

    const { data: user } = await supabase.from('users').select('id').eq('phone', phone).maybeSingle();

    if (purpose === 'register' && user) {
      return next(new AppError('This phone number is already registered. Please log in.', 409));
    }

    if (purpose === 'login' && !user) {
      return next(new AppError('No account found with this number. Please register.', 404));
    }

    await sendOTP(phone, purpose);
    res.json({ success: true, message: `OTP sent to ${phone}` });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/auth/register-firebase ────────────────────────────────────────
router.post('/register-firebase', [
  body('firstName').trim().isLength({ min: 2, max: 50 }),
  body('lastName').trim().isLength({ min: 1, max: 50 }),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('firebaseToken').notEmpty().withMessage('Firebase token is required'),
  body('role').isIn(['passenger', 'driver', 'both']),
  body('city').notEmpty(),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { firstName, lastName, email, password, firebaseToken, role, city, vehicleModel, vehicleNumber } = req.body;

    const decodedToken = await admin.auth().verifyIdToken(firebaseToken);
    const phone = decodedToken.phone_number;

    if (!phone) return next(new AppError('Invalid Firebase token: no phone number found', 400));

    const { data: existing } = await supabase
      .from('users')
      .select('phone, email')
      .or(`phone.eq.${phone},email.eq.${email}`)
      .maybeSingle();

    if (existing) {
      const field = existing.phone === phone ? 'phone number' : 'email';
      return next(new AppError(`This ${field} is already registered.`, 409));
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const userData = { 
      first_name: firstName, 
      last_name: lastName, 
      phone, 
      email, 
      password: hashedPassword, 
      role, 
      city, 
      is_phone_verified: true,
      firebase_uid: decodedToken.uid 
    };

    if ((role === 'driver' || role === 'both') && vehicleModel) {
      userData.driver_info = { vehicleModel, vehicleNumber };
    }

    const { data: user, error } = await supabase.from('users').insert(userData).select().single();
    if (error) throw error;

    logger.info(`New Firebase user registered: ${user.id}`);
    sendTokens(user, 201, res);
  } catch (error) {
    logger.error('Firebase Register Error:', error.message);
    next(new AppError('Failed to verify phone number with Google. Please try again.', 401));
  }
});

// ── POST /api/auth/register ────────────────────────────────────────────────
router.post('/register', [
  body('firstName').trim().isLength({ min: 2, max: 50 }),
  body('lastName').trim().isLength({ min: 1, max: 50 }),
  body('phone').matches(/^\+91[6-9]\d{9}$/),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('otp').isLength({ min: 6, max: 6 }),
  body('role').isIn(['passenger', 'driver', 'both']),
  body('city').notEmpty(),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { firstName, lastName, phone, email, password, otp, role, city, vehicleModel, vehicleNumber } = req.body;

    const { data: existing } = await supabase
      .from('users')
      .select('phone, email')
      .or(`phone.eq.${phone},email.eq.${email}`)
      .maybeSingle();

    if (existing) {
      const field = existing.phone === phone ? 'phone number' : 'email';
      return next(new AppError(`This ${field} is already registered.`, 409));
    }

    const otpResult = await verifyOTP(phone, otp, 'register');
    if (!otpResult.success) return next(new AppError(otpResult.message, 400));

    const hashedPassword = await bcrypt.hash(password, 12);
    const userData = { 
      first_name: firstName, 
      last_name: lastName, 
      phone, 
      email, 
      password: hashedPassword, 
      role, 
      city, 
      is_phone_verified: true 
    };

    if ((role === 'driver' || role === 'both') && vehicleModel) {
      userData.driver_info = { vehicleModel, vehicleNumber };
    }

    const { data: user, error } = await supabase.from('users').insert(userData).select().single();
    if (error) throw error;

    logger.info(`New user registered: ${user.id} (${role})`);
    sendTokens(user, 201, res);
  } catch (error) {
    next(error);
  }
});

// ── POST /api/auth/login ───────────────────────────────────────────────────
router.post('/login', [
  body('phone').notEmpty().withMessage('Enter your email or mobile number'),
  body('password').notEmpty().withMessage('Enter your password'),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { phone, password, fcmToken } = req.body;

    const { data: user } = await supabase
      .from('users')
      .select('*')
      .or(`phone.eq.${phone},email.eq.${phone}`) // Checking both fields in case 'phone' contains an email
      .maybeSingle();

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return next(new AppError('Incorrect credentials or password.', 401));
    }

    if (user.is_banned) return next(new AppError('Your account has been suspended.', 403));

    if (fcmToken) {
      await supabase.from('users').update({ fcm_token: fcmToken }).eq('id', user.id);
    }

    logger.info(`User logged in: ${user.id}`);
    sendTokens(user, 200, res);
  } catch (error) {
    next(error);
  }
});

// ── POST /api/auth/login-firebase ──────────────────────────────────────────
router.post('/login-firebase', [
  body('firebaseToken').notEmpty(),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { firebaseToken, fcmToken } = req.body;
    const decodedToken = await admin.auth().verifyIdToken(firebaseToken);
    const phone = decodedToken.phone_number;
    const email = decodedToken.email;

    let user;
    if (phone) {
      const { data } = await supabase.from('users').select('*').eq('phone', phone).maybeSingle();
      user = data;
    } else if (email) {
      const { data } = await supabase.from('users').select('*').eq('email', email).maybeSingle();
      user = data;
    }

    if (!user && email) {
      const names = (decodedToken.name || 'Safar User').split(' ');
      const firstName = names[0];
      const lastName = names.slice(1).join(' ') || 'Share';
      const randomPassword = Math.random().toString(36).slice(-10);
      const hashedPassword = await bcrypt.hash(randomPassword, 12);
      
      const userData = {
        first_name: firstName, 
        last_name: lastName, 
        email,
        phone: phone || `+00${Date.now()}`,
        password: hashedPassword,
        role: 'passenger',
        city: 'Lucknow',
        is_phone_verified: !!phone,
        firebase_uid: decodedToken.uid
      };
      
      const { data, error } = await supabase.from('users').insert(userData).select().single();
      if (error) throw error;
      user = data;
      logger.info(`New Google user auto-registered: ${user.id}`);
    }

    if (!user) return next(new AppError('No account found. Please register.', 404));
    if (user.is_banned) return next(new AppError('Your account has been suspended.', 403));

    const updates = {};
    if (fcmToken) updates.fcm_token = fcmToken;
    if (!user.firebase_uid) updates.firebase_uid = decodedToken.uid;
    if (phone && !user.phone) updates.phone = phone;

    if (Object.keys(updates).length > 0) {
      const { data } = await supabase.from('users').update(updates).eq('id', user.id).select().single();
      user = data;
    }

    logger.info(`User logged in via Firebase: ${user.id}`);
    sendTokens(user, 200, res);
  } catch (error) {
    logger.error('Firebase Login Error:', error.message);
    next(new AppError('Authentication failed. Please try again.', 401));
  }
});

// ── POST /api/auth/refresh-token ──────────────────────────────────────────
router.post('/refresh-token', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return next(new AppError('Refresh token required.', 400));

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const { data: user } = await supabase.from('users').select('*').eq('id', decoded.id).maybeSingle();
    if (!user) return next(new AppError('User not found.', 401));

    const newToken = signToken(user.id);
    res.json({ success: true, token: newToken });
  } catch (error) {
    next(new AppError('Invalid or expired refresh token. Please log in again.', 401));
  }
});

// ── GET /api/auth/me ───────────────────────────────────────────────────────
router.get('/me', protect, async (req, res) => {
  const { data: user } = await supabase.from('users').select('*').eq('id', req.user.id).single();
  res.json({ success: true, data: { user } });
});

module.exports = router;
