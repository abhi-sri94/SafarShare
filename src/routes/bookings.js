const express = require('express');
const { body, validationResult } = require('express-validator');
const Booking = require('../models/Booking');
const Ride = require('../models/Ride');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { createOrder, calculatePriceBreakdown } = require('../services/razorpayService');
const { notifyBookingConfirmed, notifyBookingCancelled } = require('../services/firebaseService');
const { sendSMS } = require('../services/twilioService');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const crypto = require('crypto');

const router = express.Router();

// ── POST /api/bookings ─────────────────────────────────────────────────────
router.post('/', protect, [
  body('rideId').notEmpty().withMessage('Ride ID required'),
  body('seats').isInt({ min: 1, max: 4 }).withMessage('Seats must be 1-4'),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { rideId, seats, notes, pickupPoint, dropPoint } = req.body;

    const ride = await Ride.findById(rideId).populate('driver');
    if (!ride) return next(new AppError('Ride not found.', 404));
    if (ride.status !== 'scheduled') return next(new AppError('This ride is no longer available.', 400));
    if (ride.seatsAvailable < seats) return next(new AppError(`Only ${ride.seatsAvailable} seat(s) available.`, 400));
    if (ride.driver._id.toString() === req.user._id.toString()) return next(new AppError('You cannot book your own ride.', 400));

    // Check women-only
    if (ride.preferences.womenOnly && req.user.gender !== 'female') {
      return next(new AppError('This ride is for women passengers only.', 403));
    }

    // Check duplicate booking
    const existingBooking = await Booking.findOne({ ride: rideId, passenger: req.user._id, status: { $in: ['pending', 'confirmed'] } });
    if (existingBooking) return next(new AppError('You already have a booking on this ride.', 409));

    const { subtotal, platformFee, driverPayout, totalAmount } = calculatePriceBreakdown(ride.pricePerSeat, seats);

    // Create booking (pending until payment)
    const booking = await Booking.create({
      ride: rideId,
      passenger: req.user._id,
      driver: ride.driver._id,
      seatsBooked: seats,
      pricePerSeat: ride.pricePerSeat,
      subtotal,
      platformFee,
      totalAmount,
      driverPayout,
      pickupPoint: pickupPoint || { city: ride.origin.city },
      dropPoint: dropPoint || { city: ride.destination.city },
      notes,
      boardingCode: crypto.randomBytes(3).toString('hex').toUpperCase(),
    });

    // Reserve seats
    await Ride.findByIdAndUpdate(rideId, {
      $inc: { seatsBooked: seats, seatsAvailable: -seats },
    });

    // Create Razorpay order
    const paymentOrder = await createOrder({ ...booking.toObject(), ride });

    logger.info(`Booking created: ${booking._id} for ride ${rideId}`);

    res.status(201).json({
      success: true,
      data: {
        booking,
        paymentOrder, // Frontend uses this to open Razorpay checkout
      },
    });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/bookings/my ───────────────────────────────────────────────────
router.get('/my', protect, async (req, res, next) => {
  try {
    const { status, role = 'passenger', page = 1, limit = 20 } = req.query;

    const filter = role === 'driver' ? { driver: req.user._id } : { passenger: req.user._id };
    if (status) filter.status = status;

    const bookings = await Booking.find(filter)
      .populate('ride', 'origin destination departureTime estimatedArrivalTime distanceKm vehicleModel vehicleNumber')
      .populate('passenger', 'firstName lastName profilePhoto passengerRating phone')
      .populate('driver', 'firstName lastName profilePhoto driverRating driverInfo.vehicleModel driverInfo.vehicleNumber phone')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Booking.countDocuments(filter);
    res.json({ success: true, count: bookings.length, total, data: { bookings } });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/bookings/:id ──────────────────────────────────────────────────
router.get('/:id', protect, async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('ride')
      .populate('passenger', 'firstName lastName profilePhoto passengerRating phone emergencyContacts')
      .populate('driver', 'firstName lastName profilePhoto driverRating driverInfo phone');

    if (!booking) return next(new AppError('Booking not found.', 404));

    // Only booking parties can view
    const isParty = [booking.passenger._id.toString(), booking.driver._id.toString()].includes(req.user._id.toString());
    if (!isParty) return next(new AppError('Not authorized.', 403));

    res.json({ success: true, data: { booking } });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/bookings/:id/cancel ──────────────────────────────────────────
router.post('/:id/cancel', protect, [
  body('reason').optional().isString(),
], async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('passenger', 'firstName phone fcmToken')
      .populate('driver', 'firstName phone fcmToken')
      .populate('ride', 'origin destination departureTime');

    if (!booking) return next(new AppError('Booking not found.', 404));

    const isPassenger = booking.passenger._id.toString() === req.user._id.toString();
    if (!isPassenger) return next(new AppError('Only the passenger can cancel their booking.', 403));

    if (!['pending', 'confirmed'].includes(booking.status)) {
      return next(new AppError('This booking cannot be cancelled.', 400));
    }

    // Refund policy: full refund if >24h before departure, 50% if 2-24h, none if <2h
    const hoursUntil = (new Date(booking.ride.departureTime) - Date.now()) / (1000 * 60 * 60);
    let refundAmount = 0;
    let refundNote = '';

    if (hoursUntil > 24) {
      refundAmount = booking.totalAmount;
      refundNote = 'Full refund (cancelled >24h before departure)';
    } else if (hoursUntil > 2) {
      refundAmount = Math.round(booking.totalAmount * 0.5);
      refundNote = '50% refund (cancelled 2-24h before departure)';
    } else {
      refundNote = 'No refund (cancelled <2h before departure)';
    }

    booking.status = 'cancelled';
    booking.cancelledBy = 'passenger';
    booking.cancelReason = req.body.reason || 'Passenger cancelled';
    booking.cancelledAt = new Date();
    booking.refundAmount = refundAmount;
    booking.refundStatus = refundAmount > 0 ? 'pending' : 'none';
    await booking.save();

    // Release seats
    await Ride.findByIdAndUpdate(booking.ride._id, {
      $inc: { seatsBooked: -booking.seatsBooked, seatsAvailable: booking.seatsBooked },
    });

    // Notify driver
    await notifyBookingCancelled(booking.driver, booking, 'passenger');
    await sendSMS(booking.driver.phone, `SafarShare: ${booking.passenger.firstName} cancelled their booking for your ride. ${booking.seatsBooked} seat(s) are now available.`);

    logger.info(`Booking ${booking._id} cancelled by passenger. Refund: ₹${refundAmount}`);

    res.json({
      success: true,
      message: 'Booking cancelled.',
      refundAmount,
      refundNote,
    });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/bookings/:id/rate ────────────────────────────────────────────
router.post('/:id/rate', protect, [
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1-5'),
  body('review').optional().isString().isLength({ max: 500 }),
  body('ratingFor').isIn(['driver', 'passenger']).withMessage('Must be driver or passenger'),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { rating, review, ratingFor } = req.body;
    const booking = await Booking.findById(req.params.id)
      .populate('driver')
      .populate('passenger');

    if (!booking) return next(new AppError('Booking not found.', 404));
    if (booking.status !== 'completed') return next(new AppError('You can only rate completed rides.', 400));

    const isPassenger = booking.passenger._id.toString() === req.user._id.toString();
    const isDriver = booking.driver._id.toString() === req.user._id.toString();

    if (ratingFor === 'driver') {
      if (!isPassenger) return next(new AppError('Only the passenger can rate the driver.', 403));
      if (booking.passengerRatedDriver) return next(new AppError('You already rated this driver.', 409));

      booking.passengerRating = rating;
      booking.passengerReview = review;
      booking.passengerRatedDriver = true;
      booking.ratedAt = new Date();
      await booking.save();

      // Update driver's overall rating
      await booking.driver.updateDriverRating(rating);
    } else {
      if (!isDriver) return next(new AppError('Only the driver can rate the passenger.', 403));
      if (booking.driverRatedPassenger) return next(new AppError('You already rated this passenger.', 409));

      booking.driverGivenRating = rating;
      booking.driverReview = review;
      booking.driverRatedPassenger = true;
      await booking.save();

      // Update passenger rating
      const passenger = booking.passenger;
      const total = passenger.totalRatings || 0;
      passenger.passengerRating = ((passenger.passengerRating * total) + rating) / (total + 1);
      passenger.totalRatings = total + 1;
      await passenger.save();
    }

    res.json({ success: true, message: 'Rating submitted. Thank you!' });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/bookings/:id/panic ───────────────────────────────────────────
router.post('/:id/panic', protect, [
  body('lat').isFloat().withMessage('Latitude required'),
  body('lng').isFloat().withMessage('Longitude required'),
], async (req, res, next) => {
  try {
    const { lat, lng } = req.body;
    const booking = await Booking.findById(req.params.id)
      .populate('passenger', 'firstName lastName phone emergencyContacts')
      .populate('driver', 'firstName lastName phone driverInfo.vehicleNumber')
      .populate('ride', 'origin destination');

    if (!booking) return next(new AppError('Booking not found.', 404));

    booking.panicTriggered = true;
    booking.panicAt = new Date();
    booking.panicLocation = { lat, lng };
    await booking.save();

    const { sendPanicAlert } = require('../services/twilioService');
    const { notifyPanicAlert } = require('../services/firebaseService');

    // SMS all emergency contacts
    await sendPanicAlert(booking.passenger, { lat, lng }, booking);

    // Notify admins via push
    const admins = await User.find({ role: 'admin' }).select('fcmToken');
    const { reverseGeocode } = require('../services/mapsService');
    const locationStr = await reverseGeocode(lat, lng);
    await notifyPanicAlert(admins, booking.passenger, locationStr);

    logger.warn(`PANIC ALERT: User ${booking.passenger._id} at ${lat},${lng} on booking ${booking._id}`);

    res.json({
      success: true,
      message: 'Emergency alert sent to your contacts and SafarShare safety team.',
      emergencyNumber: '112',
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
