const express = require('express');
const { body, query, validationResult } = require('express-validator');
const Ride = require('../models/Ride');
const Booking = require('../models/Booking');
const { protect, requireDriverApproval } = require('../middleware/auth');
const { geocodeAddress, getDistanceAndDuration, getRoutePolyline } = require('../services/mapsService');
const { sendSMS } = require('../services/twilioService');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const router = express.Router();

// ── GET /api/rides/search ─────────────────────────────────────────────────
router.get('/search', [
  query('from').notEmpty().withMessage('From city required'),
  query('to').notEmpty().withMessage('To city required'),
  query('date').isISO8601().withMessage('Valid date required (YYYY-MM-DD)'),
  query('seats').optional().isInt({ min: 1, max: 6 }).withMessage('Seats must be 1-6'),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { from, to, date, seats = 1, womenOnly, maxPrice, minPrice } = req.query;

    // Build date range for the day
    const searchDate = new Date(date);
    const nextDay = new Date(searchDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const filter = {
      'origin.city': { $regex: new RegExp(from, 'i') },
      'destination.city': { $regex: new RegExp(to, 'i') },
      departureTime: { $gte: searchDate, $lt: nextDay },
      seatsAvailable: { $gte: parseInt(seats) },
      status: 'scheduled',
    };

    if (womenOnly === 'true') filter['preferences.womenOnly'] = true;
    if (maxPrice) filter.pricePerSeat = { ...filter.pricePerSeat, $lte: parseInt(maxPrice) };
    if (minPrice) filter.pricePerSeat = { ...filter.pricePerSeat, $gte: parseInt(minPrice) };

    const rides = await Ride.find(filter)
      .populate('driver', 'firstName lastName profilePhoto driverRating driverInfo.vehicleModel driverInfo.vehicleNumber driverInfo.isOnline totalRides')
      .sort({ pricePerSeat: 1, departureTime: 1 })
      .limit(50);

    res.json({
      success: true,
      count: rides.length,
      data: { rides },
    });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/rides ────────────────────────────────────────────────────────
router.post('/', protect, requireDriverApproval, [
  body('originCity').notEmpty().withMessage('Pickup city required'),
  body('destinationCity').notEmpty().withMessage('Destination city required'),
  body('departureTime').isISO8601().withMessage('Valid departure time required'),
  body('totalSeats').isInt({ min: 1, max: 6 }).withMessage('Seats must be 1-6'),
  body('pricePerSeat').isInt({ min: 50, max: 5000 }).withMessage('Price must be ₹50-₹5000'),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { originCity, originAddress, destinationCity, destinationAddress, departureTime, totalSeats, pricePerSeat, stops, preferences, notes } = req.body;

    // Get coordinates
    const [originCoords, destCoords] = await Promise.all([
      geocodeAddress(originAddress || originCity),
      geocodeAddress(destinationAddress || destinationCity),
    ]);

    // Get distance & duration
    const { distanceKm, durationMinutes } = await getDistanceAndDuration(
      { lat: originCoords.lat, lng: originCoords.lng },
      { lat: destCoords.lat, lng: destCoords.lng }
    );

    // Get route polyline
    const { polyline } = await getRoutePolyline(
      { lat: originCoords.lat, lng: originCoords.lng },
      { lat: destCoords.lat, lng: destCoords.lng }
    );

    // Estimated arrival
    const departure = new Date(departureTime);
    const estimatedArrival = new Date(departure.getTime() + durationMinutes * 60 * 1000);

    const ride = await Ride.create({
      driver: req.user._id,
      origin: {
        city: originCity,
        address: originAddress,
        coordinates: { type: 'Point', coordinates: [originCoords.lng, originCoords.lat] },
      },
      destination: {
        city: destinationCity,
        address: destinationAddress,
        coordinates: { type: 'Point', coordinates: [destCoords.lng, destCoords.lat] },
      },
      stops: stops || [],
      departureTime: departure,
      estimatedArrivalTime: estimatedArrival,
      durationMinutes,
      distanceKm,
      totalSeats,
      seatsAvailable: totalSeats,
      pricePerSeat,
      vehicleModel: req.user.driverInfo?.vehicleModel,
      vehicleNumber: req.user.driverInfo?.vehicleNumber,
      preferences: preferences || {},
      routePolyline: polyline,
      notes,
    });

    await ride.populate('driver', 'firstName lastName profilePhoto driverRating driverInfo');
    logger.info(`New ride created: ${ride._id} by driver ${req.user._id}`);

    res.status(201).json({ success: true, data: { ride } });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/rides/:id ─────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const ride = await Ride.findById(req.params.id)
      .populate('driver', 'firstName lastName profilePhoto driverRating driverInfo totalRides emergencyContacts');

    if (!ride) return next(new AppError('Ride not found.', 404));
    res.json({ success: true, data: { ride } });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/rides/driver/my-rides ────────────────────────────────────────
router.get('/driver/my-rides', protect, async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = { driver: req.user._id };
    if (status) filter.status = status;

    const rides = await Ride.find(filter)
      .sort({ departureTime: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Ride.countDocuments(filter);
    res.json({ success: true, count: rides.length, total, data: { rides } });
  } catch (error) {
    next(error);
  }
});

// ── PATCH /api/rides/:id/start ─────────────────────────────────────────────
router.patch('/:id/start', protect, async (req, res, next) => {
  try {
    const ride = await Ride.findById(req.params.id);
    if (!ride) return next(new AppError('Ride not found.', 404));
    if (ride.driver.toString() !== req.user._id.toString()) return next(new AppError('Not authorized.', 403));
    if (ride.status !== 'scheduled') return next(new AppError('Ride cannot be started in current status.', 400));

    ride.status = 'in_progress';
    await ride.save();

    // Notify all passengers
    const bookings = await Booking.find({ ride: ride._id, status: 'confirmed' })
      .populate('passenger', 'firstName fcmToken phone');

    const { notifyRideStarted } = require('../services/firebaseService');
    await notifyRideStarted(bookings.map(b => b.passenger), bookings[0]);

    res.json({ success: true, message: 'Ride started', data: { ride } });
  } catch (error) {
    next(error);
  }
});

// ── PATCH /api/rides/:id/complete ─────────────────────────────────────────
router.patch('/:id/complete', protect, async (req, res, next) => {
  try {
    const ride = await Ride.findById(req.params.id);
    if (!ride) return next(new AppError('Ride not found.', 404));
    if (ride.driver.toString() !== req.user._id.toString()) return next(new AppError('Not authorized.', 403));

    ride.status = 'completed';
    await ride.save();

    // Complete all bookings + trigger payouts
    const bookings = await Booking.find({ ride: ride._id, status: 'in_progress' })
      .populate('passenger', 'firstName fcmToken')
      .populate('driver', 'firstName fcmToken driverInfo');

    const { notifyRideCompleted } = require('../services/firebaseService');
    const { payoutToDriver } = require('../services/razorpayService');

    for (const booking of bookings) {
      booking.status = 'completed';
      booking.completedAt = new Date();
      await booking.save();
      await notifyRideCompleted(booking.passenger, booking.driver, booking);
      await payoutToDriver(booking, booking.driver);
    }

    res.json({ success: true, message: 'Ride completed. Payouts processing.', data: { ride } });
  } catch (error) {
    next(error);
  }
});

// ── PATCH /api/rides/:id/cancel ────────────────────────────────────────────
router.patch('/:id/cancel', protect, async (req, res, next) => {
  try {
    const { reason } = req.body;
    const ride = await Ride.findById(req.params.id);
    if (!ride) return next(new AppError('Ride not found.', 404));
    if (ride.driver.toString() !== req.user._id.toString()) return next(new AppError('Not authorized.', 403));
    if (!['scheduled', 'active'].includes(ride.status)) return next(new AppError('Cannot cancel this ride.', 400));

    // Check cancellation window (penalty if within 12 hours)
    const hoursUntilDeparture = (ride.departureTime - Date.now()) / (1000 * 60 * 60);
    const isPenalty = hoursUntilDeparture < parseInt(process.env.CANCELLATION_PENALTY_HOURS);

    ride.status = 'cancelled';
    ride.cancelledBy = 'driver';
    ride.cancelReason = reason || 'Driver cancelled';
    ride.cancelledAt = new Date();
    if (isPenalty) ride.penaltyApplied = true;
    await ride.save();

    // Refund all confirmed bookings
    const bookings = await Booking.find({ ride: ride._id, status: 'confirmed' })
      .populate('passenger', 'firstName fcmToken phone');

    const { processRefund } = require('../services/razorpayService');
    const { notifyBookingCancelled } = require('../services/firebaseService');

    for (const booking of bookings) {
      booking.status = 'cancelled';
      booking.cancelledBy = 'driver';
      booking.refundAmount = booking.totalAmount;
      booking.refundStatus = 'pending';
      await booking.save();
      await notifyBookingCancelled(booking.passenger, booking, 'driver');
      await sendSMS(booking.passenger.phone, `SafarShare: Your ride ${ride.origin.city} → ${ride.destination.city} was cancelled by the driver. Full refund of ₹${booking.totalAmount} will be processed within 24 hours.`);
    }

    logger.info(`Ride ${ride._id} cancelled by driver ${req.user._id}. Penalty: ${isPenalty}`);
    res.json({ success: true, message: 'Ride cancelled. Passengers notified and refunds initiated.', penaltyApplied: isPenalty });
  } catch (error) {
    next(error);
  }
});

// ── PATCH /api/rides/:id/location ─────────────────────────────────────────
// Called every 10s by driver app to update live location
router.patch('/:id/location', protect, async (req, res, next) => {
  try {
    const { lat, lng } = req.body;
    if (!lat || !lng) return next(new AppError('lat and lng required.', 400));

    await Ride.findByIdAndUpdate(req.params.id, {
      currentLocation: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
    });

    // Emit to Socket.io room
    const { getIO } = require('../socket/socket');
    getIO().to(`ride_${req.params.id}`).emit('location_update', { lat, lng, timestamp: new Date() });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/rides/nearby ─────────────────────────────────────────────────
router.get('/nearby/drivers', async (req, res, next) => {
  try {
    const { lat, lng, radius = 5000 } = req.query;
    if (!lat || !lng) return next(new AppError('lat and lng required.', 400));

    const drivers = await User.find({
      'driverInfo.isOnline': true,
      isDriverApproved: true,
      'driverInfo.currentLocation': {
        $nearSphere: {
          $geometry: { type: 'Point', coordinates: [parseFloat(lng), parseFloat(lat)] },
          $maxDistance: parseInt(radius),
        },
      },
    }).select('firstName lastName driverInfo.currentLocation driverInfo.vehicleModel driverRating');

    res.json({ success: true, count: drivers.length, data: { drivers } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
