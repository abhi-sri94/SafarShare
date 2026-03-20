import Geolocation from 'react-native-geolocation-service';
import { Platform, PermissionsAndroid } from 'react-native';
import { emitDriverLocation } from './socketService';
import { ridesAPI } from './api';

let watchId = null;
let trackingRideId = null;
let locationBuffer = [];
let bufferTimer = null;

// ── Request permissions ───────────────────────────────────────────────────
export const requestLocationPermission = async () => {
  if (Platform.OS === 'ios') {
    const status = await Geolocation.requestAuthorization('whenInUse');
    return status === 'granted';
  }
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    {
      title: 'SafarShare Location Permission',
      message: 'SafarShare needs your location for ride tracking and safety features.',
      buttonPositive: 'Allow',
    }
  );
  return granted === PermissionsAndroid.RESULTS.GRANTED;
};

export const requestBackgroundPermission = async () => {
  if (Platform.OS === 'android') {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
      {
        title: 'Background Location',
        message: 'SafarShare needs background location to share your position with passengers during a ride.',
        buttonPositive: 'Allow',
      }
    );
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  }
  const status = await Geolocation.requestAuthorization('always');
  return status === 'granted';
};

// ── Get current position once ─────────────────────────────────────────────
export const getCurrentPosition = () =>
  new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  });

// ── Start driver tracking (sends location every 10s during active ride) ───
export const startDriverTracking = async (rideId) => {
  const hasPermission = await requestLocationPermission();
  if (!hasPermission) throw new Error('Location permission denied');

  trackingRideId = rideId;

  watchId = Geolocation.watchPosition(
    (pos) => {
      const { latitude: lat, longitude: lng, speed } = pos.coords;

      // Emit to Socket.io in real time
      emitDriverLocation(rideId, lat, lng, speed || 0);

      // Buffer for REST API update (every 5th point)
      locationBuffer.push({ lat, lng });
      if (locationBuffer.length >= 5) {
        const latest = locationBuffer[locationBuffer.length - 1];
        ridesAPI.updateLocation(rideId, latest.lat, latest.lng).catch(() => {});
        locationBuffer = [];
      }
    },
    (err) => console.warn('[GPS] Watch error:', err.message),
    {
      enableHighAccuracy: true,
      distanceFilter: 20,        // Only update if moved 20m
      interval: 10000,           // Every 10 seconds
      fastestInterval: 5000,
      showsBackgroundLocationIndicator: true,  // iOS
      foregroundService: {                      // Android
        notificationTitle: 'SafarShare',
        notificationBody: 'Sharing your location with passengers',
      },
    }
  );
};

// ── Stop driver tracking ──────────────────────────────────────────────────
export const stopDriverTracking = () => {
  if (watchId !== null) {
    Geolocation.clearWatch(watchId);
    watchId = null;
  }
  if (bufferTimer) {
    clearInterval(bufferTimer);
    bufferTimer = null;
  }
  trackingRideId = null;
  locationBuffer = [];
};

// ── Watch passenger location (for sharing) ───────────────────────────────
export const watchPassengerLocation = (onUpdate) => {
  const id = Geolocation.watchPosition(
    (pos) => onUpdate({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
    (err) => console.warn('[GPS] Passenger watch error:', err.message),
    { enableHighAccuracy: true, distanceFilter: 50, interval: 15000 }
  );
  return () => Geolocation.clearWatch(id);
};
