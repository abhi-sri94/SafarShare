// ── tracking.js ──────────────────────────────────────────────────────────
const express = require('express');
const supabase = require('../config/supabase');
const { protect } = require('../middleware/auth');
const { reverseGeocode } = require('../services/mapsService');
const AppError = require('../utils/AppError');

const trackingRouter = express.Router();

// GET /api/tracking/:rideId
trackingRouter.get('/:rideId', protect, async (req, res, next) => {
  try {
    const { data: ride } = await supabase
      .from('rides')
      .select('*, driver:users(*)')
      .eq('id', req.params.rideId)
      .single();

    if (!ride) return next(new AppError('Ride not found.', 404));

    // Verify user is a passenger on this ride or the driver
    const { data: booking } = await supabase
      .from('bookings')
      .select('id')
      .eq('ride_id', req.params.rideId)
      .eq('passenger_id', req.user.id)
      .in('status', ['confirmed', 'in_progress'])
      .maybeSingle();

    const isDriver = ride.driver_id === req.user.id;
    if (!booking && !isDriver) return next(new AppError('Not authorized to track this ride.', 403));

    // Progress estimate
    const now = new Date();
    const departure = new Date(ride.departure_time);
    const elapsed = Math.max(0, (now - departure) / 1000 / 60);
    const duration = ride.duration_minutes || 120;
    const progress = Math.min(100, Math.round((elapsed / duration) * 100));

    let currentAddress = null;
    if (ride.current_location?.lng) {
      currentAddress = await reverseGeocode(ride.current_location.lat, ride.current_location.lng);
    }

    res.json({
      success: true,
      data: {
        ride,
        tracking: {
          currentLocation: ride.current_location,
          currentAddress,
          progress,
          estimatedMinutesRemaining: Math.max(0, Math.round(duration - elapsed)),
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

module.exports = trackingRouter;
