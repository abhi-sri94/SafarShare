const express = require('express');
const { body, validationResult } = require('express-validator');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const User = require('../models/User');
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

// Multer — memory storage (upload to Cloudinary)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
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
    const user = await User.findById(req.params.id)
      .select('-password -passwordResetToken -emailVerifyToken -refreshToken -driverInfo.aadhaarNumber');

    if (!user) return next(new AppError('User not found.', 404));
    res.json({ success: true, data: { user } });
  } catch (error) {
    next(error);
  }
});

// ── PATCH /api/users/profile ───────────────────────────────────────────────
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
    const allowed = ['firstName', 'lastName', 'city', 'bio', 'gender', 'dateOfBirth', 'savedUpiId', 'preferences', 'fcmToken'];
    const updates = {};
    allowed.forEach(field => { if (req.body[field] !== undefined) updates[field] = req.body[field]; });

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
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
    await User.findByIdAndUpdate(req.user._id, { profilePhoto: url });
    res.json({ success: true, data: { profilePhoto: url } });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/users/upload-document ───────────────────────────────────────
router.post('/upload-document', protect, upload.single('document'), [
  body('docType').isIn(['aadhaar', 'license', 'rc', 'insurance']).withMessage('Invalid document type'),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    if (!req.file) return next(new AppError('Document file required.', 400));

    const { docType, docNumber } = req.body;
    const url = await uploadToCloudinary(req.file.buffer, `documents/${docType}`, 'image');

    const docFieldMap = {
      aadhaar: 'driverInfo.aadhaarDoc',
      license: 'driverInfo.licenseDoc',
      rc: 'driverInfo.rcDoc',
      insurance: 'driverInfo.insuranceDoc',
    };

    const update = { [docFieldMap[docType]]: url };
    if (docNumber) {
      const numFieldMap = { aadhaar: 'driverInfo.aadhaarNumber', license: 'driverInfo.licenseNumber', rc: 'driverInfo.rcNumber' };
      if (numFieldMap[docType]) update[numFieldMap[docType]] = docNumber;
    }

    await User.findByIdAndUpdate(req.user._id, update);
    logger.info(`Document uploaded: ${docType} for user ${req.user._id}`);

    res.json({ success: true, message: `${docType} document uploaded. Pending admin verification.`, url });
  } catch (error) {
    next(error);
  }
});

// ── PATCH /api/users/emergency-contacts ───────────────────────────────────
router.patch('/emergency-contacts', protect, [
  body('contacts').isArray({ min: 1, max: 3 }).withMessage('1-3 emergency contacts required'),
  body('contacts.*.name').notEmpty().withMessage('Contact name required'),
  body('contacts.*.phone').matches(/^\+91[6-9]\d{9}$/).withMessage('Valid Indian mobile required'),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { emergencyContacts: req.body.contacts },
      { new: true }
    );
    res.json({ success: true, data: { emergencyContacts: user.emergencyContacts } });
  } catch (error) {
    next(error);
  }
});

// ── PATCH /api/users/driver-info ───────────────────────────────────────────
router.patch('/driver-info', protect, [
  body('vehicleModel').optional().notEmpty(),
  body('vehicleNumber').optional().matches(/^[A-Z]{2}\d{2}[A-Z]{1,2}\d{4}$/).withMessage('Valid vehicle number required (e.g. UP32AB1234)'),
  body('vehicleColor').optional().notEmpty(),
  body('vehicleType').optional().isIn(['hatchback', 'sedan', 'suv', 'mpv']),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const allowed = ['vehicleModel', 'vehicleNumber', 'vehicleColor', 'vehicleType', 'licenseNumber', 'licenseExpiry', 'rcNumber'];
    const driverUpdate = {};
    allowed.forEach(f => { if (req.body[f]) driverUpdate[`driverInfo.${f}`] = req.body[f]; });

    const user = await User.findByIdAndUpdate(req.user._id, driverUpdate, { new: true });
    res.json({ success: true, data: { driverInfo: user.driverInfo } });
  } catch (error) {
    next(error);
  }
});

// ── PATCH /api/users/change-password ──────────────────────────────────────
router.patch('/change-password', protect, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }).withMessage('New password must be 8+ characters'),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password');

    if (!(await user.comparePassword(currentPassword))) {
      return next(new AppError('Current password is incorrect.', 400));
    }

    user.password = newPassword;
    await user.save();
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

    if (role === 'driver' && !req.user.isDriverApproved) {
      return next(new AppError('Your driver account is pending admin approval.', 403));
    }

    await User.findByIdAndUpdate(req.user._id, { activeRole: role });
    res.json({ success: true, message: `Switched to ${role} mode.` });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/users/stats/me ────────────────────────────────────────────────
router.get('/stats/me', protect, async (req, res, next) => {
  try {
    const Booking = require('../models/Booking');
    const [asPassenger, asDriver] = await Promise.all([
      Booking.aggregate([
        { $match: { passenger: req.user._id, status: 'completed' } },
        { $group: { _id: null, totalRides: { $sum: 1 }, totalSpent: { $sum: '$totalAmount' }, avgRating: { $avg: '$driverGivenRating' } } },
      ]),
      Booking.aggregate([
        { $match: { driver: req.user._id, status: 'completed' } },
        { $group: { _id: null, totalRides: { $sum: 1 }, totalEarned: { $sum: '$driverPayout' }, avgRating: { $avg: '$passengerRating' } } },
      ]),
    ]);

    res.json({
      success: true,
      data: {
        asPassenger: asPassenger[0] || { totalRides: 0, totalSpent: 0 },
        asDriver: asDriver[0] || { totalRides: 0, totalEarned: 0 },
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
