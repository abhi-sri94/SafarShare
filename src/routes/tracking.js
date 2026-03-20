// ── tracking.js ──────────────────────────────────────────────────────────
const express = require('express');
const Ride = require('../models/Ride');
const Booking = require('../models/Booking');
const { protect } = require('../middleware/auth');
const { reverseGeocode } = require('../services/mapsService');
const AppError = require('../utils/AppError');

const trackingRouter = express.Router();

// GET /api/tracking/:rideId — get current driver location + ride progress
trackingRouter.get('/:rideId', protect, async (req, res, next) => {
  try {
    const ride = await Ride.findById(req.params.rideId)
      .select('origin destination currentLocation status departureTime estimatedArrivalTime distanceKm durationMinutes routePolyline')
      .populate('driver', 'firstName lastName driverInfo.vehicleModel driverInfo.vehicleNumber driverRating');

    if (!ride) return next(new AppError('Ride not found.', 404));

    // Verify user is a passenger on this ride
    const booking = await Booking.findOne({ ride: req.params.rideId, passenger: req.user._id, status: { $in: ['confirmed', 'in_progress'] } });
    const isDriver = ride.driver._id.toString() === req.user._id.toString();
    if (!booking && !isDriver) return next(new AppError('Not authorized to track this ride.', 403));

    // Calculate progress (rough estimate based on time)
    const now = new Date();
    const elapsed = Math.max(0, (now - ride.departureTime) / 1000 / 60); // minutes elapsed
    const progress = Math.min(100, Math.round((elapsed / (ride.durationMinutes || 120)) * 100));

    // ETA
    const estimatedMinutesRemaining = Math.max(0, (ride.durationMinutes || 120) - elapsed);

    let currentAddress = null;
    if (ride.currentLocation?.coordinates?.[0]) {
      const [lng, lat] = ride.currentLocation.coordinates;
      currentAddress = await reverseGeocode(lat, lng);
    }

    res.json({
      success: true,
      data: {
        ride,
        tracking: {
          currentLocation: ride.currentLocation,
          currentAddress,
          progress,
          estimatedMinutesRemaining: Math.round(estimatedMinutesRemaining),
          distanceCoveredKm: Math.round((progress / 100) * (ride.distanceKm || 0)),
          distanceRemainingKm: Math.round(((100 - progress) / 100) * (ride.distanceKm || 0)),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = trackingRouter;
