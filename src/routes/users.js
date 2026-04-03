const express = require('express');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const bcrypt = require('bcryptjs');
const supabase = require('../config/supabase');
const { protect } = require('../middleware/auth');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const router = express.Router();

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') cb(null, true);
    else cb(new AppError('Only images and PDFs allowed.', 400));
  },
});

const uploadToCloudinary = (buffer, folder, resourceType = 'image') =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `safarshare/${folder}`, resource_type: resourceType },
      (err, result) => err ? reject(err) : resolve(result.secure_url)
    );
    stream.end(buffer);
  });

// ── GET /api/users/:id ─────────────────────────────────────────────────────
router.get('/:id', protect, async (req, res, next) => {
  try {
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !user) return next(new AppError('User not found.', 404));
    
    delete user.password;
    if (user.driver_info) delete user.driver_info.aadhaarNumber;

    res.json({ success: true, data: { user } });
  } catch (error) {
    next(error);
  }
});

// ── PATCH /api/users/profile/update ───────────────────────────────────────
router.patch('/profile/update', protect, [
  body('firstName').optional().trim().isLength({ min: 2, max: 50 }),
  body('lastName').optional().trim().isLength({ min: 1, max: 50 }),
  body('city').optional().trim(),
  body('bio').optional().isLength({ max: 200 }),
  body('gender').optional().isIn(['male', 'female', 'other', 'prefer_not_to_say']),
  body('savedUpiId').optional().trim(),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const fieldMap = {
      firstName: 'first_name',
      lastName: 'last_name',
      city: 'city',
      bio: 'bio',
      gender: 'gender',
      savedUpiId: 'saved_upi_id',
      fcmToken: 'fcm_token',
      preferences: 'preferences'
    };

    const updates = {};
    Object.keys(fieldMap).forEach(key => {
      if (req.body[key] !== undefined) updates[fieldMap[key]] = req.body[key];
    });

    const { data: user, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data: { user } });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/users/profile-photo ─────────────────────────────────────────
router.post('/profile-photo', protect, upload.single('photo'), async (req, res, next) => {
  try {
    if (!req.file) return next(new AppError('Photo file required.', 400));
    const url = await uploadToCloudinary(req.file.buffer, 'profiles');
    
    await supabase
      .from('users')
      .update({ profile_photo: url })
      .eq('id', req.user.id);

    res.json({ success: true, data: { profilePhoto: url } });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/users/upload-document ───────────────────────────────────────
router.post('/upload-document', protect, upload.single('document'), [
  body('docType').isIn(['aadhaar', 'license', 'rc', 'insurance']),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    if (!req.file) return next(new AppError('Document file required.', 400));
    const { docType, docNumber } = req.body;
    const url = await uploadToCloudinary(req.file.buffer, `documents/${docType}`, 'image');

    const { data: user } = await supabase.from('users').select('driver_info').eq('id', req.user.id).single();
    const driverInfo = user.driver_info || {};

    const docFieldMap = { aadhaar: 'aadhaarDoc', license: 'licenseDoc', rc: 'rcDoc', insurance: 'insuranceDoc' };
    driverInfo[docFieldMap[docType]] = url;

    if (docNumber) {
      const numFieldMap = { aadhaar: 'aadhaarNumber', license: 'licenseNumber', rc: 'rcNumber' };
      if (numFieldMap[docType]) driverInfo[numFieldMap[docType]] = docNumber;
    }

    await supabase.from('users').update({ driver_info: driverInfo }).eq('id', req.user.id);
    logger.info(`Document uploaded: ${docType} for user ${req.user.id}`);

    res.json({ success: true, message: `${docType} uploaded.`, url });
  } catch (error) {
    next(error);
  }
});

// ── PATCH /api/users/emergency-contacts ───────────────────────────────────
router.patch('/emergency-contacts', protect, [
  body('contacts').isArray({ min: 1, max: 3 }),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { data: user, error } = await supabase
      .from('users')
      .update({ emergency_contacts: req.body.contacts })
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ success: true, data: { emergencyContacts: user.emergency_contacts } });
  } catch (error) {
    next(error);
  }
});

// ── PATCH /api/users/change-password ──────────────────────────────────────
router.patch('/change-password', protect, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { currentPassword, newPassword } = req.body;
    const { data: user } = await supabase.from('users').select('password').eq('id', req.user.id).single();

    if (!(await bcrypt.compare(currentPassword, user.password))) {
      return next(new AppError('Current password is incorrect.', 400));
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await supabase.from('users').update({ password: hashedPassword }).eq('id', req.user.id);

    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (error) {
    next(error);
  }
});

// ── PATCH /api/users/switch-role ───────────────────────────────────────────
router.patch('/switch-role', protect, async (req, res, next) => {
  try {
    const { role } = req.body;
    if (!['passenger', 'driver'].includes(role)) return next(new AppError('Role must be passenger or driver.', 400));

    if (role === 'driver' && !req.user.is_driver_approved) {
      return next(new AppError('Your driver account is pending approval.', 403));
    }

    await supabase.from('users').update({ active_role: role }).eq('id', req.user.id);
    res.json({ success: true, message: `Switched to ${role} mode.` });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/users/stats/me ────────────────────────────────────────────────
router.get('/stats/me', protect, async (req, res, next) => {
  try {
    const { data: asPassengerData } = await supabase
      .from('bookings')
      .select('total_amount, driver_given_rating')
      .eq('passenger_id', req.user.id)
      .eq('status', 'completed');

    const { data: asDriverData } = await supabase
      .from('bookings')
      .select('driver_payout, passenger_rating')
      .eq('driver_id', req.user.id)
      .eq('status', 'completed');

    const calcStats = (data, valKey, rateKey) => {
      if (!data || data.length === 0) return { totalRides: 0, totalVal: 0, avgRating: 0 };
      const totalRides = data.length;
      const totalVal = data.reduce((sum, item) => sum + (item[valKey] || 0), 0);
      const ratings = data.map(item => item[rateKey]).filter(r => r != null);
      const avgRating = ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
      return { totalRides, totalVal, avgRating };
    };

    const passengerStats = calcStats(asPassengerData, 'total_amount', 'driver_given_rating');
    const driverStats = calcStats(asDriverData, 'driver_payout', 'passenger_rating');

    res.json({
      success: true,
      data: {
        asPassenger: { totalRides: passengerStats.totalRides, totalSpent: passengerStats.totalVal, avgRating: passengerStats.avgRating },
        asDriver: { totalRides: driverStats.totalRides, totalEarned: driverStats.totalVal, avgRating: driverStats.avgRating },
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
