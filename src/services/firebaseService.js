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
    logger.warn('Firebase init failed (notifications disabled):', error.message);
  }
};

initFirebase();

/**
 * Send push notification to a single device
 */
const sendPush = async (fcmToken, title, body, data = {}) => {
  if (!firebaseInitialized || !fcmToken) return;

  try {
    const message = {
      token: fcmToken,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      android: {
        priority: 'high',
        notification: { sound: 'default', channelId: 'safarshare_alerts' },
      },
      apns: {
        payload: { aps: { sound: 'default', badge: 1 } },
      },
    };

    const response = await admin.messaging().send(message);
    logger.info(`Push sent: ${response}`);
    return response;
  } catch (error) {
    logger.warn('sendPush error:', error.message);
    // Don't throw — notification failure shouldn't break the main flow
  }
};

/**
 * Send to multiple devices (multicast)
 */
const sendMulticast = async (fcmTokens, title, body, data = {}) => {
  if (!firebaseInitialized || !fcmTokens?.length) return;

  try {
    const message = {
      tokens: fcmTokens.filter(Boolean),
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      android: { priority: 'high' },
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    logger.info(`Multicast: ${response.successCount} sent, ${response.failureCount} failed`);
  } catch (error) {
    logger.warn('sendMulticast error:', error.message);
  }
};

// ─── Notification Templates ───────────────────────────────────────────────────

const notifyBookingConfirmed = async (passenger, driver, booking) => {
  await sendPush(passenger.fcmToken, '🎉 Booking Confirmed!', `Your seat on ${booking.ride?.origin?.city} → ${booking.ride?.destination?.city} is confirmed.`, { type: 'booking_confirmed', bookingId: booking._id.toString() });
  await sendPush(driver.fcmToken, '🧳 New Passenger!', `${passenger.fullName} booked ${booking.seatsBooked} seat(s) on your ride.`, { type: 'new_booking', bookingId: booking._id.toString() });
};

const notifyRideStarted = async (passengers, booking) => {
  const tokens = passengers.map(p => p.fcmToken).filter(Boolean);
  await sendMulticast(tokens, '🚗 Ride Started!', 'Your driver has started the ride. Track your journey live.', { type: 'ride_started', bookingId: booking._id.toString() });
};

const notifyRideCompleted = async (passenger, driver, booking) => {
  await sendPush(passenger.fcmToken, '✅ Ride Completed', 'You have arrived! Please rate your driver.', { type: 'ride_completed', bookingId: booking._id.toString() });
  await sendPush(driver.fcmToken, '✅ Ride Completed', `Payout of ₹${booking.driverPayout} will be processed within 24 hours.`, { type: 'payout_pending', bookingId: booking._id.toString() });
};

const notifyBookingCancelled = async (user, booking, cancelledBy) => {
  const title = cancelledBy === 'driver' ? '😞 Ride Cancelled by Driver' : 'Booking Cancelled';
  const body = cancelledBy === 'driver' ? 'Your driver cancelled this ride. A full refund will be processed.' : 'Your booking has been cancelled.';
  await sendPush(user.fcmToken, title, body, { type: 'booking_cancelled', bookingId: booking._id.toString() });
};

const notifyPanicAlert = async (adminUsers, user, location) => {
  const tokens = adminUsers.map(a => a.fcmToken).filter(Boolean);
  await sendMulticast(tokens, '🚨 PANIC ALERT', `${user.fullName} triggered the panic button at ${location}.`, { type: 'panic_alert', userId: user._id.toString() });
};

const notifyNewMessage = async (receiver, sender, messageText) => {
  await sendPush(receiver.fcmToken, `💬 ${sender.fullName}`, messageText.substring(0, 100), { type: 'new_message', senderId: sender._id.toString() });
};

const notifyDriverApproved = async (driver) => {
  await sendPush(driver.fcmToken, '🎉 Driver Account Approved!', 'Congratulations! You can now post rides on SafarShare.', { type: 'driver_approved' });
};

module.exports = {
  sendPush, sendMulticast,
  notifyBookingConfirmed, notifyRideStarted, notifyRideCompleted,
  notifyBookingCancelled, notifyPanicAlert, notifyNewMessage, notifyDriverApproved,
};
