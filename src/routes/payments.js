const express = require('express');
const { body, validationResult } = require('express-validator');
const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
const { protect } = require('../middleware/auth');
const { verifyAndCapturePayment, processRefund, handleWebhook } = require('../services/razorpayService');
const { notifyBookingConfirmed } = require('../services/firebaseService');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const router = express.Router();

// ── POST /api/payments/verify ──────────────────────────────────────────────
// Called by frontend after Razorpay checkout completes
router.post('/verify', protect, [
  body('razorpayOrderId').notEmpty(),
  body('razorpayPaymentId').notEmpty(),
  body('razorpaySignature').notEmpty(),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    const result = await verifyAndCapturePayment({ razorpayOrderId, razorpayPaymentId, razorpaySignature });
    if (!result.success) return next(new AppError(result.message, 400));

    const booking = await Booking.findById(result.paymentRecord.booking)
      .populate('passenger', 'firstName lastName fcmToken phone')
      .populate('driver', 'firstName lastName fcmToken phone')
      .populate('ride', 'origin destination departureTime');

    // Notify both parties
    await notifyBookingConfirmed(booking.passenger, booking.driver, booking);

    res.json({
      success: true,
      message: 'Payment successful! Booking confirmed.',
      data: { booking, payment: result.paymentRecord },
    });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/payments/my ───────────────────────────────────────────────────
router.get('/my', protect, async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const payments = await Payment.find({ payer: req.user._id })
      .populate({ path: 'booking', populate: { path: 'ride', select: 'origin destination departureTime' } })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Payment.countDocuments({ payer: req.user._id });

    // Summary stats
    const stats = await Payment.aggregate([
      { $match: { payer: req.user._id, status: 'captured' } },
      { $group: { _id: null, totalSpent: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);

    res.json({
      success: true,
      count: payments.length,
      total,
      stats: stats[0] || { totalSpent: 0, count: 0 },
      data: { payments },
    });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/payments/earnings ─────────────────────────────────────────────
// Driver earnings summary
router.get('/earnings', protect, async (req, res, next) => {
  try {
    const { period = 'month' } = req.query;
    const now = new Date();
    let startDate;

    if (period === 'week') startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
    else if (period === 'month') startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    else if (period === 'year') startDate = new Date(now.getFullYear(), 0, 1);
    else startDate = new Date(0);

    const earnings = await Payment.aggregate([
      {
        $match: {
          receiver: req.user._id,
          status: 'captured',
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          dailyEarnings: { $sum: { $subtract: ['$amount', { $multiply: ['$amount', 0.13] }] } },
          rides: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const totalEarnings = earnings.reduce((sum, day) => sum + day.dailyEarnings, 0);
    const totalRides = earnings.reduce((sum, day) => sum + day.rides, 0);
    const pendingPayout = await Payment.aggregate([
      { $match: { receiver: req.user._id, payoutStatus: 'pending', status: 'captured' } },
      { $group: { _id: null, amount: { $sum: '$amount' } } },
    ]);

    res.json({
      success: true,
      data: {
        period,
        totalEarnings: Math.round(totalEarnings),
        totalRides,
        pendingPayout: Math.round((pendingPayout[0]?.amount || 0) * 0.87),
        dailyBreakdown: earnings,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/payments/:id/receipt ─────────────────────────────────────────
router.get('/:id/receipt', protect, async (req, res, next) => {
  try {
    const payment = await Payment.findById(req.params.id)
      .populate({ path: 'booking', populate: [{ path: 'ride' }, { path: 'passenger', select: 'firstName lastName phone' }, { path: 'driver', select: 'firstName lastName driverInfo.vehicleNumber' }] });

    if (!payment) return next(new AppError('Payment not found.', 404));
    if (payment.payer.toString() !== req.user._id.toString()) return next(new AppError('Not authorized.', 403));

    res.json({ success: true, data: { payment } });
  } catch (error) {
    next(error);
  }
});

// ── POST /webhook/razorpay ────────────────────────────────────────────────
// Raw body route registered in server.js
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const success = await handleWebhook(req.body, signature);
    res.json({ success });
  } catch (error) {
    logger.error('Webhook error:', error);
    res.status(500).json({ success: false });
  }
});

module.exports = router;
