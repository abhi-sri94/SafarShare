const admin = require('firebase-admin');
const logger = require('../utils/logger');

let firebaseInitialized = false;

const initFirebase = () => {
  if (firebaseInitialized) return;
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      }),
    });
    firebaseInitialized = true;
    logger.info('Firebase Admin initialized');
  } catch (error) {
    logger.warn('Firebase init failed:', error.message);
  }
};

initFirebase();

const sendPush = async (fcmToken, title, body, data = {}) => {
  if (!firebaseInitialized || !fcmToken) return;
  try {
    const message = {
      token: fcmToken,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      android: { priority: 'high', notification: { sound: 'default' } },
      apns: { payload: { aps: { sound: 'default', badge: 1 } } },
    };
    await admin.messaging().send(message);
  } catch (error) {
    logger.warn('sendPush error:', error.message);
  }
};

const sendMulticast = async (fcmTokens, title, body, data = {}) => {
  const tokens = fcmTokens.filter(Boolean);
  if (!firebaseInitialized || !tokens.length) return;
  try {
    const message = {
      tokens,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
    };
    await admin.messaging().sendEachForMulticast(message);
  } catch (error) {
    logger.warn('sendMulticast error:', error.message);
  }
};

const notifyBookingConfirmed = async (passenger, driver, booking) => {
  await sendPush(passenger.fcm_token, '🎉 Booking Confirmed!', 'Your seat is confirmed.', { type: 'booking_confirmed', bookingId: booking.id });
  await sendPush(driver.fcm_token, '🧳 New Passenger!', 'New booking on your ride.', { type: 'new_booking', bookingId: booking.id });
};

const notifyRideStarted = async (passengers, booking) => {
  const tokens = passengers.map(p => p.fcm_token);
  await sendMulticast(tokens, '🚗 Ride Started!', 'Your driver has started the ride.', { type: 'ride_started', bookingId: booking.id });
};

const notifyRideCompleted = async (passenger, driver, booking) => {
  await sendPush(passenger.fcm_token, '✅ Ride Completed', 'Please rate your driver.', { type: 'ride_completed', bookingId: booking.id });
  await sendPush(driver.fcm_token, '✅ Ride Completed', 'Earnings processed.', { type: 'payout_pending', bookingId: booking.id });
};

const notifyBookingCancelled = async (user, booking, cancelledBy) => {
  const title = cancelledBy === 'driver' ? '😞 Ride Cancelled' : 'Booking Cancelled';
  await sendPush(user.fcm_token, title, 'Booking status updated.', { type: 'booking_cancelled', bookingId: booking.id });
};

const notifyPanicAlert = async (adminUsers, user, location) => {
  const tokens = adminUsers.map(a => a.fcm_token);
  await sendMulticast(tokens, '🚨 PANIC ALERT', `User triggered panic button at ${location}.`, { type: 'panic_alert', userId: user.id });
};

const notifyNewMessage = async (receiver, sender, messageText) => {
  await sendPush(receiver.fcm_token, `💬 ${sender.first_name}`, messageText.substring(0, 100), { type: 'new_message', senderId: sender.id });
};

const notifyDriverApproved = async (driver) => {
  await sendPush(driver.fcm_token, '🎉 Account Approved!', 'You can now post rides.', { type: 'driver_approved' });
};

module.exports = {
  sendPush, sendMulticast,
  notifyBookingConfirmed, notifyRideStarted, notifyRideCompleted,
  notifyBookingCancelled, notifyPanicAlert, notifyNewMessage, notifyDriverApproved,
};
