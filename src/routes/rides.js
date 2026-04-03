const express = require('express');
const { body, query, validationResult } = require('express-validator');
const supabase = require('../config/supabase');
const { protect, requireDriverApproval } = require('../middleware/auth');
const { geocodeAddress, getDistanceAndDuration, getRoutePolyline } = require('../services/mapsService');
const { sendSMS } = require('../services/twilioService');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const router = express.Router();

// ── GET /api/rides/search ─────────────────────────────────────────────────
router.get('/search', [
  query('from').notEmpty(),
  query('to').notEmpty(),
  query('date').isISO8601(),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { from, to, date, seats = 1, womenOnly, maxPrice, minPrice } = req.query;

    const searchDate = new Date(date);
    const nextDay = new Date(searchDate);
    nextDay.setDate(nextDay.getDate() + 1);

    let queryBuilder = supabase
      .from('rides')
      .select('*, driver:users(*)')
      .eq('status', 'scheduled')
      .gte('departure_time', searchDate.toISOString())
      .lt('departure_time', nextDay.toISOString())
      .gte('seats_available', parseInt(seats));

    // JSONB filtering for city
    queryBuilder = queryBuilder.filter('origin->>city', 'ilike', `%${from}%`);
    queryBuilder = queryBuilder.filter('destination->>city', 'ilike', `%${to}%`);

    if (womenOnly === 'true') {
      queryBuilder = queryBuilder.filter('preferences->>womenOnly', 'eq', 'true');
    }

    if (maxPrice) queryBuilder = queryBuilder.lte('price_per_seat', parseInt(maxPrice));
    if (minPrice) queryBuilder = queryBuilder.gte('price_per_seat', parseInt(minPrice));

    const { data: rides, error } = await queryBuilder
      .order('price_per_seat', { ascending: true })
      .order('departure_time', { ascending: true })
      .limit(50);

    if (error) throw error;

    res.json({ success: true, count: rides.length, data: { rides } });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/rides ────────────────────────────────────────────────────────
router.post('/', protect, requireDriverApproval, [
  body('originCity').notEmpty(),
  body('destinationCity').notEmpty(),
  body('departureTime').isISO8601(),
  body('totalSeats').isInt({ min: 1, max: 6 }),
  body('pricePerSeat').isInt({ min: 50, max: 5000 }),
], async (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

  try {
    const { originCity, originAddress, destinationCity, destinationAddress, departureTime, totalSeats, pricePerSeat, stops, preferences, notes } = req.body;

    const [originCoords, destCoords] = await Promise.all([
      geocodeAddress(originAddress || originCity),
      geocodeAddress(destinationAddress || destinationCity),
    ]);

    const { distanceKm, durationMinutes } = await getDistanceAndDuration(
      { lat: originCoords.lat, lng: originCoords.lng },
      { lat: destCoords.lat, lng: destCoords.lng }
    );

    const { polyline } = await getRoutePolyline(
      { lat: originCoords.lat, lng: originCoords.lng },
      { lat: destCoords.lat, lng: destCoords.lng }
    );

    const departure = new Date(departureTime);
    const estimatedArrival = new Date(departure.getTime() + durationMinutes * 60 * 1000);

    const rideData = {
      driver_id: req.user.id,
      origin: { city: originCity, address: originAddress, lng: originCoords.lng, lat: originCoords.lat },
      destination: { city: destinationCity, address: destinationAddress, lng: destCoords.lng, lat: destCoords.lat },
      stops: stops || [],
      departure_time: departure.toISOString(),
      estimated_arrival_time: estimatedArrival.toISOString(),
      duration_minutes: durationMinutes,
      distance_km: distanceKm,
      total_seats: totalSeats,
      seats_available: totalSeats,
      price_per_seat: pricePerSeat,
      vehicle_model: req.user.driver_info?.vehicleModel,
      vehicle_number: req.user.driver_info?.vehicleNumber,
      preferences: preferences || {},
      route_polyline: polyline,
      notes,
    };

    const { data: ride, error } = await supabase.from('rides').insert(rideData).select('*, driver:users(*)').single();
    if (error) throw error;

    logger.info(`New ride created: ${ride.id} by driver ${req.user.id}`);
    res.status(201).json({ success: true, data: { ride } });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/rides/:id ─────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const { data: ride, error } = await supabase
      .from('rides')
      .select('*, driver:users(*)')
      .eq('id', req.params.id)
      .single();

    if (error || !ride) return next(new AppError('Ride not found.', 404));
    res.json({ success: true, data: { ride } });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/rides/driver/my-rides ────────────────────────────────────────
router.get('/driver/my-rides', protect, async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    let queryBuilder = supabase.from('rides').select('*', { count: 'exact' }).eq('driver_id', req.user.id);
    
    if (status) queryBuilder = queryBuilder.eq('status', status);

    const { data: rides, count, error } = await queryBuilder
      .order('departure_time', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (error) throw error;
    res.json({ success: true, count: rides.length, total: count, data: { rides } });
  } catch (error) {
    next(error);
  }
});

// ── PATCH /api/rides/:id/start ─────────────────────────────────────────────
router.patch('/:id/start', protect, async (req, res, next) => {
  try {
    const { data: ride } = await supabase.from('rides').select('*').eq('id', req.params.id).single();
    if (!ride) return next(new AppError('Ride not found.', 404));
    if (ride.driver_id !== req.user.id) return next(new AppError('Not authorized.', 403));

    await supabase.from('rides').update({ status: 'in_progress', updated_at: new Date().toISOString() }).eq('id', req.params.id);

    const { data: bookings } = await supabase
      .from('bookings')
      .select('*, passenger:users(*)')
      .eq('ride_id', ride.id)
      .eq('status', 'confirmed');

    if (bookings?.length > 0) {
      const { notifyRideStarted } = require('../services/firebaseService');
      await notifyRideStarted(bookings.map(b => b.passenger), bookings[0]);
    }

    res.json({ success: true, message: 'Ride started' });
  } catch (error) {
    next(error);
  }
});

// ── PATCH /api/rides/:id/complete ─────────────────────────────────────────
router.patch('/:id/complete', protect, async (req, res, next) => {
  try {
    const { data: ride } = await supabase.from('rides').select('*').eq('id', req.params.id).single();
    if (!ride) return next(new AppError('Ride not found.', 404));
    if (ride.driver_id !== req.user.id) return next(new AppError('Not authorized.', 403));

    await supabase.from('rides').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', req.params.id);

    const { data: bookings } = await supabase
      .from('bookings')
      .select('*, passenger:users(*), driver:users(*)')
      .eq('ride_id', ride.id);

    const { notifyRideCompleted } = require('../services/firebaseService');
    const { payoutToDriver } = require('../services/razorpayService');

    for (const booking of (bookings || [])) {
      if (booking.status === 'in_progress' || booking.status === 'confirmed') {
        await supabase.from('bookings').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', booking.id);
        await notifyRideCompleted(booking.passenger, booking.driver, booking);
        await payoutToDriver(booking, booking.driver);
      }
    }

    res.json({ success: true, message: 'Ride completed.' });
  } catch (error) {
    next(error);
  }
});

// ── PATCH /api/rides/:id/location ─────────────────────────────────────────
router.patch('/:id/location', protect, async (req, res, next) => {
  try {
    const { lat, lng } = req.body;
    if (!lat || !lng) return next(new AppError('lat and lng required.', 400));

    await supabase.from('rides').update({ 
      current_location: { lng: parseFloat(lng), lat: parseFloat(lat) },
      updated_at: new Date().toISOString()
    }).eq('id', req.params.id);

    const { getIO } = require('../socket/socket');
    getIO().to(`ride_${req.params.id}`).emit('location_update', { lat, lng, timestamp: new Date() });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
