import messaging from '@react-native-firebase/messaging';
import { Platform } from 'react-native';
import { usersAPI } from './api';

// ── Request notification permission ──────────────────────────────────────
export const requestNotificationPermission = async () => {
  const authStatus = await messaging().requestPermission();
  const enabled =
    authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
    authStatus === messaging.AuthorizationStatus.PROVISIONAL;
  return enabled;
};

// ── Get & register FCM token ──────────────────────────────────────────────
export const registerFCMToken = async () => {
  try {
    const token = await messaging().getToken();
    if (token) {
      await usersAPI.updateFCM(token);
      console.log('[FCM] Token registered:', token.substring(0, 20) + '...');
    }
    return token;
  } catch (e) {
    console.warn('[FCM] Token registration failed:', e.message);
    return null;
  }
};

// ── Handle foreground messages ────────────────────────────────────────────
export const setupForegroundHandler = (onMessage) => {
  return messaging().onMessage(async (remoteMessage) => {
    const { title, body } = remoteMessage.notification || {};
    const data = remoteMessage.data || {};
    onMessage({ title, body, data });
  });
};

// ── Handle background / quit state messages ───────────────────────────────
export const setupBackgroundHandler = () => {
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    console.log('[FCM] Background message:', remoteMessage.notification?.title);
    // React Native Firebase handles the notification display automatically
  });
};

// ── Handle notification tap (app opened from notification) ───────────────
export const setupNotificationOpenHandler = (navigate) => {
  // App opened from background by tapping notification
  messaging().onNotificationOpenedApp((remoteMessage) => {
    handleNotificationNavigation(remoteMessage.data, navigate);
  });

  // App opened from quit state by tapping notification
  messaging().getInitialNotification().then((remoteMessage) => {
    if (remoteMessage) {
      handleNotificationNavigation(remoteMessage.data, navigate);
    }
  });
};

const handleNotificationNavigation = (data, navigate) => {
  if (!data || !navigate) return;
  switch (data.type) {
    case 'booking_confirmed':
    case 'booking_cancelled':
      navigate('BookingDetail', { bookingId: data.bookingId });
      break;
    case 'ride_started':
    case 'ride_completed':
      navigate('Tracking', { rideId: data.rideId });
      break;
    case 'new_message':
      navigate('Chat', { bookingId: data.bookingId });
      break;
    case 'panic_alert':
      navigate('PanicMonitor', { userId: data.userId });
      break;
    case 'driver_approved':
      navigate('DriverHome');
      break;
  }
};
