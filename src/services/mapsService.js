const axios = require('axios');
const logger = require('../utils/logger');

const MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const BASE_URL = 'https://maps.googleapis.com/maps/api';

/**
 * Geocode a city/address to lat/lng coordinates
 */
const geocodeAddress = async (address) => {
  try {
    const response = await axios.get(`${BASE_URL}/geocode/json`, {
      params: {
        address: `${address}, India`,
        key: MAPS_API_KEY,
        region: 'in',
        language: 'en',
      },
    });

    const data = response.data;
    if (data.status !== 'OK' || !data.results.length) {
      throw new Error(`Geocoding failed for: ${address}`);
    }

    const location = data.results[0].geometry.location;
    return {
      lat: location.lat,
      lng: location.lng,
      formattedAddress: data.results[0].formatted_address,
      placeId: data.results[0].place_id,
    };
  } catch (error) {
    logger.error('geocodeAddress error:', error.message);
    // Return fallback coordinates for known UP cities
    return getFallbackCoordinates(address);
  }
};

/**
 * Calculate distance & duration between two points
 */
const getDistanceAndDuration = async (origin, destination) => {
  try {
    const response = await axios.get(`${BASE_URL}/distancematrix/json`, {
      params: {
        origins: `${origin.lat},${origin.lng}`,
        destinations: `${destination.lat},${destination.lng}`,
        key: MAPS_API_KEY,
        mode: 'driving',
        units: 'metric',
        region: 'in',
      },
    });

    const data = response.data;
    if (data.status !== 'OK') throw new Error('Distance matrix failed');

    const element = data.rows[0].elements[0];
    if (element.status !== 'OK') throw new Error('Route not found');

    return {
      distanceMeters: element.distance.value,
      distanceKm: Math.round(element.distance.value / 1000),
      durationSeconds: element.duration.value,
      durationMinutes: Math.round(element.duration.value / 60),
      durationText: element.duration.text,
      distanceText: element.distance.text,
    };
  } catch (error) {
    logger.error('getDistanceAndDuration error:', error.message);
    // Return estimated distance for known routes
    return getEstimatedDistance(origin, destination);
  }
};

/**
 * Get encoded polyline for route visualization
 */
const getRoutePolyline = async (origin, destination) => {
  try {
    const response = await axios.get(`${BASE_URL}/directions/json`, {
      params: {
        origin: `${origin.lat},${origin.lng}`,
        destination: `${destination.lat},${destination.lng}`,
        key: MAPS_API_KEY,
        mode: 'driving',
        region: 'in',
        optimize: true,
      },
    });

    const data = response.data;
    if (data.status !== 'OK' || !data.routes.length) {
      throw new Error('No route found');
    }

    const route = data.routes[0];
    return {
      polyline: route.overview_polyline.points,
      steps: route.legs[0].steps.map(s => ({
        instruction: s.html_instructions.replace(/<[^>]+>/g, ''),
        distance: s.distance.text,
        duration: s.duration.text,
      })),
    };
  } catch (error) {
    logger.error('getRoutePolyline error:', error.message);
    return { polyline: null, steps: [] };
  }
};

/**
 * Autocomplete city suggestions (for search inputs)
 */
const autocomplete = async (input) => {
  try {
    const response = await axios.get(`${BASE_URL}/place/autocomplete/json`, {
      params: {
        input,
        key: MAPS_API_KEY,
        types: '(cities)',
        components: 'country:in',
        language: 'en',
      },
    });

    return response.data.predictions.map(p => ({
      description: p.description,
      placeId: p.place_id,
      mainText: p.structured_formatting.main_text,
    }));
  } catch (error) {
    logger.error('autocomplete error:', error.message);
    return [];
  }
};

/**
 * Reverse geocode: coordinates → address
 */
const reverseGeocode = async (lat, lng) => {
  try {
    const response = await axios.get(`${BASE_URL}/geocode/json`, {
      params: { latlng: `${lat},${lng}`, key: MAPS_API_KEY, language: 'en', region: 'in' },
    });

    if (response.data.status === 'OK' && response.data.results.length) {
      return response.data.results[0].formatted_address;
    }
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch (error) {
    logger.error('reverseGeocode error:', error.message);
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
};

/**
 * Fallback coordinates for major UP cities (when API unavailable)
 */
const getFallbackCoordinates = (city) => {
  const cities = {
    'lucknow':     { lat: 26.8467, lng: 80.9462 },
    'kanpur':      { lat: 26.4499, lng: 80.3319 },
    'varanasi':    { lat: 25.3176, lng: 82.9739 },
    'prayagraj':   { lat: 25.4358, lng: 81.8463 },
    'gorakhpur':   { lat: 26.7606, lng: 83.3732 },
    'agra':        { lat: 27.1767, lng: 78.0081 },
    'mathura':     { lat: 27.4924, lng: 77.6737 },
    'bahraich':    { lat: 27.5701, lng: 81.5952 },
    'basti':       { lat: 26.8000, lng: 82.7333 },
    'ayodhya':     { lat: 26.7922, lng: 82.1998 },
    'meerut':      { lat: 28.9845, lng: 77.7064 },
    'ghaziabad':   { lat: 28.6692, lng: 77.4538 },
    'noida':       { lat: 28.5355, lng: 77.3910 },
    'aligarh':     { lat: 27.8974, lng: 78.0880 },
    'bareilly':    { lat: 28.3670, lng: 79.4304 },
    'moradabad':   { lat: 28.8386, lng: 78.7733 },
    'saharanpur':  { lat: 29.9640, lng: 77.5460 },
    'firozabad':   { lat: 27.1533, lng: 78.3952 },
    'jhansi':      { lat: 25.4484, lng: 78.5685 },
  };
  const key = city.toLowerCase().trim();
  return cities[key] || { lat: 26.8467, lng: 80.9462, formattedAddress: city }; // Default to Lucknow
};

/**
 * Estimate distance using Haversine formula (fallback)
 */
const getEstimatedDistance = (origin, destination) => {
  const R = 6371;
  const dLat = (destination.lat - origin.lat) * Math.PI / 180;
  const dLng = (destination.lng - origin.lng) * Math.PI / 180;
  const a = Math.sin(dLat/2) ** 2 + Math.cos(origin.lat * Math.PI/180) * Math.cos(destination.lat * Math.PI/180) * Math.sin(dLng/2) ** 2;
  const distanceKm = Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  const durationMinutes = Math.round(distanceKm * 1.2); // Rough estimate

  return { distanceKm, durationMinutes, distanceMeters: distanceKm * 1000, durationText: `${durationMinutes} mins`, distanceText: `${distanceKm} km` };
};

module.exports = { geocodeAddress, getDistanceAndDuration, getRoutePolyline, autocomplete, reverseGeocode, getFallbackCoordinates };
