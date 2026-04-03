const express = require('express');
const { body, validationResult } = require('express-validator');
const supabase = require('../config/supabase');
const { protect } = require('../middleware/auth');
const { createOrder, calculatePriceBreakdown } = require('../services/razorpayService');
const { notifyBookingConfirmed, notifyBookingCancelled } = require('../services/firebaseService');
const { sendSMS } = require('../services/twilioService');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const crypto = require('crypto');

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

// ── POST /api/bookings ─────────────────────────────────────────────────────
router.post('/', protect, [
  body('rideId').notEmpty(),
  body('seats').isInt({ min: 1, max: 4 }),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { rideId, seats, notes, pickupPoint, dropPoint } = req.body;

    const { data: ride } = await supabase.from('rides').select('*, driver:users(*)').eq('id', rideId).single();
    if (!ride) return next(new AppError('Ride not found.', 404));
    if (ride.status !== 'scheduled') return next(new AppError('Ride not available.', 400));
    if (ride.seats_available < seats) return next(new AppError(`Only ${ride.seats_available} seats left.`, 400));
    if (ride.driver_id === req.user.id) return next(new AppError('Cannot book own ride.', 400));

    if (ride.preferences?.womenOnly && req.user.gender !== 'female') {
      return next(new AppError('Women only ride.', 403));
    }

    const { subtotal, platformFee, driverPayout, totalAmount } = calculatePriceBreakdown(ride.price_per_seat, seats);

    const bookingData = {
      ride_id: rideId,
      passenger_id: req.user.id,
      driver_id: ride.driver_id,
      seats_booked: seats,
      price_per_seat: ride.price_per_seat,
      subtotal,
      platform_fee: platformFee,
      total_amount: totalAmount,
      driver_payout: driverPayout,
      pickup_point: pickupPoint || ride.origin,
      drop_point: dropPoint || ride.destination,
      notes,
      boarding_code: crypto.randomBytes(3).toString('hex').toUpperCase(),
    };

    const { data: booking, error: bError } = await supabase.from('bookings').insert(bookingData).select().single();
    if (bError) throw bError;

    // Reserve seats
    await supabase.from('rides')
      .update({ 
        seats_booked: ride.seats_booked + seats, 
        seats_available: ride.seats_available - seats 
      })
      .eq('id', rideId);

    const paymentOrder = await createOrder({ ...booking, ride });
    logger.info(`Booking created: ${booking.id} for ride ${rideId}`);

    res.status(201).json({ success: true, data: { booking, paymentOrder } });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/bookings/my ───────────────────────────────────────────────────
router.get('/my', protect, async (req, res, next) => {
  try {
    const { status, role = 'passenger', page = 1, limit = 20 } = req.query;
    const userIdField = role === 'driver' ? 'driver_id' : 'passenger_id';
    
    let queryBuilder = supabase
      .from('bookings')
      .select('*, ride:rides(*), passenger:users(*), driver:users(*)', { count: 'exact' })
      .eq(userIdField, req.user.id);

    if (status) queryBuilder = queryBuilder.eq('status', status);

    const { data: bookings, count, error } = await queryBuilder
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (error) throw error;
    res.json({ success: true, count: bookings.length, total: count, data: { bookings } });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/bookings/:id/cancel ──────────────────────────────────────────
router.post('/:id/cancel', protect, async (req, res, next) => {
  try {
    const { data: booking } = await getPopulatedBooking(req.params.id);
    if (!booking) return next(new AppError('Booking not found.', 404));

    if (booking.passenger_id !== req.user.id) return next(new AppError('Unauthorized.', 403));
    if (!['pending', 'confirmed'].includes(booking.status)) return next(new AppError('Cannot cancel.', 400));

    const hoursUntil = (new Date(booking.ride.departure_time) - Date.now()) / (1000 * 60 * 60);
    let refundAmount = 0;
    if (hoursUntil > 24) refundAmount = booking.total_amount;
    else if (hoursUntil > 2) refundAmount = Math.round(booking.total_amount * 0.5);

    await supabase.from('bookings').update({
      status: 'cancelled',
      cancelled_by: 'passenger',
      cancelled_at: new Date().toISOString(),
      refund_amount: refundAmount,
      refund_status: refundAmount > 0 ? 'pending' : 'none'
    }).eq('id', req.params.id);

    // Release seats
    const { data: ride } = await supabase.from('rides').select('seats_booked, seats_available').eq('id', booking.ride_id).single();
    await supabase.from('rides').update({
      seats_booked: ride.seats_booked - booking.seats_booked,
      seats_available: ride.seats_available + booking.seats_booked
    }).eq('id', booking.ride_id);

    await notifyBookingCancelled(booking.driver, booking, 'passenger');
    res.json({ success: true, message: 'Booking cancelled.', refundAmount });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
