const express = require('express');
const { body, validationResult } = require('express-validator');
const supabase = require('../config/supabase');
const { protect } = require('../middleware/auth');
const { verifyAndCapturePayment, handleWebhook } = require('../services/razorpayService');
const { notifyBookingConfirmed } = require('../services/firebaseService');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const router = express.Router();

// ── Role Specific Fetching ────────────────────────────────────────────────
const getPopulatedBooking = async (id) => {
  const { data, error } = await supabase
    .from('bookings')
    .select('*, ride:rides(*), passenger:users(*), driver:users(*)')
    .eq('id', id)
    .single();
  return { data, error };
};

// ── POST /api/payments/verify ──────────────────────────────────────────────
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

    const { data: booking } = await getPopulatedBooking(result.paymentRecord.booking_id);
    await notifyBookingConfirmed(booking.passenger, booking.driver, booking);

    res.json({
      success: true,
      message: 'Payment successful!',
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

    const { data: payments, count, error } = await supabase
      .from('payments')
      .select('*, booking:bookings(*, ride:rides(*))', { count: 'exact' })
      .eq('payer_id', req.user.id)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (error) throw error;

    // Summary stats (simple fetch and calculate)
    const { data: allCaptured } = await supabase
      .from('payments')
      .select('amount')
      .eq('payer_id', req.user.id)
      .eq('status', 'captured');

    const totalSpent = allCaptured?.reduce((sum, p) => sum + p.amount, 0) || 0;

    res.json({
      success: true,
      count: payments.length,
      total: count,
      stats: { totalSpent, count: allCaptured?.length || 0 },
      data: { payments },
    });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/payments/earnings ─────────────────────────────────────────────
router.get('/earnings', protect, async (req, res, next) => {
  try {
    const { period = 'month' } = req.query;
    const now = new Date();
    let startDate;

    if (period === 'week') startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
    else if (period === 'month') startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    else if (period === 'year') startDate = new Date(now.getFullYear(), 0, 1);
    else startDate = new Date(0);

    const { data: payments, error } = await supabase
      .from('payments')
      .select('*')
      .eq('receiver_id', req.user.id)
      .eq('status', 'captured')
      .gte('created_at', startDate.toISOString());

    if (error) throw error;

    // Grouping logic in JS
    const earningsByDay = {};
    payments.forEach(p => {
      const day = p.created_at.split('T')[0];
      if (!earningsByDay[day]) earningsByDay[day] = { dailyEarnings: 0, rides: 0 };
      earningsByDay[day].dailyEarnings += p.amount * 0.87; // Assuming 13% commission
      earningsByDay[day].rides += 1;
    });

    const dailyBreakdown = Object.keys(earningsByDay).map(date => ({
      _id: date,
      ...earningsByDay[date],
      dailyEarnings: Math.round(earningsByDay[date].dailyEarnings)
    })).sort((a, b) => a._id.localeCompare(b._id));

    const totalEarnings = dailyBreakdown.reduce((sum, d) => sum + d.dailyEarnings, 0);
    const totalRides = dailyBreakdown.reduce((sum, d) => sum + d.rides, 0);

    res.json({
      success: true,
      data: {
        period,
        totalEarnings,
        totalRides,
        dailyBreakdown
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
