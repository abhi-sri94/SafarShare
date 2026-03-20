const express = require('express');
const User = require('../models/User');
const Ride = require('../models/Ride');
const Booking = require('../models/Booking');
const Payment = require('../models/Payment');
const { protect, restrictTo } = require('../middleware/auth');
const { notifyDriverApproved } = require('../services/firebaseService');
const { sendSMS } = require('../services/twilioService');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const router = express.Router();

// All admin routes require auth + admin role
router.use(protect, restrictTo('admin'));

// ── GET /api/admin/dashboard ───────────────────────────────────────────────
router.get('/dashboard', async (req, res, next) => {
  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

    const [
      totalUsers, newUsersToday, pendingDrivers, bannedUsers,
      totalRides, activeRides, ridestoday, cancelledRides,
      revenueMonth, pendingPayouts, panicAlerts,
    ] = await Promise.all([
      User.countDocuments({ role: { $ne: 'admin' } }),
      User.countDocuments({ createdAt: { $gte: today } }),
      User.countDocuments({ isDriverApproved: false, role: { $in: ['driver', 'both'] }, isBanned: false }),
      User.countDocuments({ isBanned: true }),
      Ride.countDocuments(),
      Ride.countDocuments({ status: 'in_progress' }),
      Ride.countDocuments({ createdAt: { $gte: today } }),
      Ride.countDocuments({ status: 'cancelled' }),
      Payment.aggregate([{ $match: { status: 'captured', createdAt: { $gte: thisMonth } } }, { $group: { _id: null, total: { $sum: '$amount' }, commission: { $sum: { $multiply: ['$amount', 0.13] } } } }]),
      Payment.aggregate([{ $match: { payoutStatus: 'pending', status: 'captured' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
      Booking.countDocuments({ panicTriggered: true, panicResolvedAt: null }),
    ]);

    res.json({
      success: true,
      data: {
        users: { total: totalUsers, newToday: newUsersToday, pendingDriverApproval: pendingDrivers, banned: bannedUsers },
        rides: { total: totalRides, active: activeRides, today: ridestoday, cancelled: cancelledRides },
        revenue: {
          thisMonth: revenueMonth[0]?.total || 0,
          commission: revenueMonth[0]?.commission || 0,
          pendingPayouts: pendingPayouts[0]?.total || 0,
        },
        safety: { activePanicAlerts: panicAlerts },
      },
    });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/admin/pending-drivers ─────────────────────────────────────────
router.get('/pending-drivers', async (req, res, next) => {
  try {
    const drivers = await User.find({
      role: { $in: ['driver', 'both'] },
      isDriverApproved: false,
      isBanned: false,
    }).select('-password').sort({ createdAt: -1 });

    res.json({ success: true, count: drivers.length, data: { drivers } });
  } catch (error) {
    next(error);
  }
});

// ── PATCH /api/admin/drivers/:id/approve ──────────────────────────────────
router.patch('/drivers/:id/approve', async (req, res, next) => {
  try {
    const driver = await User.findByIdAndUpdate(
      req.params.id,
      { isDriverApproved: true },
      { new: true }
    );
    if (!driver) return next(new AppError('Driver not found.', 404));

    await notifyDriverApproved(driver);
    await sendSMS(driver.phone, `SafarShare: Congratulations ${driver.firstName}! Your driver account has been approved. You can now post rides. Download the app and start earning!`);

    logger.info(`Driver approved: ${driver._id} by admin ${req.user._id}`);
    res.json({ success: true, message: `${driver.fullName} approved as driver.` });
  } catch (error) {
    next(error);
  }
});

// ── PATCH /api/admin/drivers/:id/reject ───────────────────────────────────
router.patch('/drivers/:id/reject', async (req, res, next) => {
  try {
    const { reason } = req.body;
    const driver = await User.findById(req.params.id);
    if (!driver) return next(new AppError('Driver not found.', 404));

    await sendSMS(driver.phone, `SafarShare: Your driver application was not approved. Reason: ${reason || 'Incomplete documents'}. Please re-upload your documents and reapply.`);

    logger.info(`Driver rejected: ${driver._id} by admin ${req.user._id}. Reason: ${reason}`);
    res.json({ success: true, message: 'Driver application rejected. User notified.' });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/admin/users ───────────────────────────────────────────────────
router.get('/users', async (req, res, next) => {
  try {
    const { search, role, isBanned, page = 1, limit = 20 } = req.query;
    const filter = {};

    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { phone: { $regex: search } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }
    if (role) filter.role = role;
    if (isBanned !== undefined) filter.isBanned = isBanned === 'true';

    const users = await User.find(filter)
      .select('-password -passwordResetToken -emailVerifyToken')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await User.countDocuments(filter);
    res.json({ success: true, count: users.length, total, data: { users } });
  } catch (error) {
    next(error);
  }
});

// ── PATCH /api/admin/users/:id/ban ────────────────────────────────────────
router.patch('/users/:id/ban', async (req, res, next) => {
  try {
    const { reason, duration } = req.body; // duration in days, null = permanent
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBanned: true, banReason: reason || 'Violated terms of service' },
      { new: true }
    );
    if (!user) return next(new AppError('User not found.', 404));

    await sendSMS(user.phone, `SafarShare: Your account has been suspended. Reason: ${reason || 'Terms violation'}. Contact support@safarshare.in to appeal.`);

    logger.warn(`User banned: ${user._id} by admin ${req.user._id}. Reason: ${reason}`);
    res.json({ success: true, message: `${user.fullName} has been banned.` });
  } catch (error) {
    next(error);
  }
});

// ── PATCH /api/admin/users/:id/unban ─────────────────────────────────────
router.patch('/users/:id/unban', async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, { isBanned: false, banReason: null }, { new: true });
    if (!user) return next(new AppError('User not found.', 404));
    await sendSMS(user.phone, 'SafarShare: Your account has been reinstated. Welcome back!');
    res.json({ success: true, message: `${user.fullName} unbanned.` });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/admin/rides ───────────────────────────────────────────────────
router.get('/rides', async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const rides = await Ride.find(filter)
      .populate('driver', 'firstName lastName phone driverInfo.vehicleNumber')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Ride.countDocuments(filter);
    res.json({ success: true, count: rides.length, total, data: { rides } });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/admin/analytics ───────────────────────────────────────────────
router.get('/analytics', async (req, res, next) => {
  try {
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Daily revenue last 30 days
    const dailyRevenue = await Payment.aggregate([
      { $match: { status: 'captured', createdAt: { $gte: last30Days } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, revenue: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    // Top routes
    const topRoutes = await Ride.aggregate([
      { $group: { _id: { from: '$origin.city', to: '$destination.city' }, count: { $sum: 1 }, avgPrice: { $avg: '$pricePerSeat' } } },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    // User growth
    const userGrowth = await User.aggregate([
      { $match: { createdAt: { $gte: last30Days } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);

    // Cancellation rate
    const [total, cancelled] = await Promise.all([
      Ride.countDocuments({ createdAt: { $gte: last30Days } }),
      Ride.countDocuments({ status: 'cancelled', createdAt: { $gte: last30Days } }),
    ]);

    res.json({
      success: true,
      data: {
        dailyRevenue,
        topRoutes: topRoutes.map(r => ({ from: r._id.from, to: r._id.to, count: r.count, avgPrice: Math.round(r.avgPrice) })),
        userGrowth,
        cancellationRate: total ? ((cancelled / total) * 100).toFixed(1) : 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/admin/panic-alerts ────────────────────────────────────────────
router.get('/panic-alerts', async (req, res, next) => {
  try {
    const alerts = await Booking.find({ panicTriggered: true })
      .populate('passenger', 'firstName lastName phone emergencyContacts')
      .populate('driver', 'firstName lastName phone driverInfo.vehicleNumber')
      .populate('ride', 'origin destination')
      .sort({ panicAt: -1 })
      .limit(50);

    res.json({ success: true, count: alerts.length, data: { alerts } });
  } catch (error) {
    next(error);
  }
});

// ── PATCH /api/admin/panic/:bookingId/resolve ─────────────────────────────
router.patch('/panic/:bookingId/resolve', async (req, res, next) => {
  try {
    await Booking.findByIdAndUpdate(req.params.bookingId, { panicResolvedAt: new Date() });
    logger.info(`Panic alert resolved: booking ${req.params.bookingId} by admin ${req.user._id}`);
    res.json({ success: true, message: 'Panic alert marked as resolved.' });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/admin/setup ──────────────────────────────────────────────────
// One-time admin account creation (use admin secret key)
router.post('/setup', async (req, res, next) => {
  // Remove the protect/restrictTo middleware for this one route
}, async (req, res, next) => {
  try {
    const { secretKey, firstName, lastName, phone, email, password } = req.body;
    if (secretKey !== process.env.ADMIN_SECRET_KEY) return next(new AppError('Invalid secret key.', 403));

    const existing = await User.findOne({ role: 'admin' });
    if (existing) return next(new AppError('Admin already exists.', 409));

    const admin = await User.create({ firstName, lastName, phone, email, password, role: 'admin', isPhoneVerified: true, isEmailVerified: true });
    logger.info(`Admin account created: ${admin._id}`);
    res.status(201).json({ success: true, message: 'Admin account created.', adminId: admin._id });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
