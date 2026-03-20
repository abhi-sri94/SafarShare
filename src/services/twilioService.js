/**
 * twilioService.js  ← filename kept so all routes import without changes
 * SMS layer powered by MSG91 (not Twilio)
 *
 * MSG91 docs: https://docs.msg91.com
 * Sign up:    https://msg91.com
 */

const axios  = require('axios');
const crypto = require('crypto');
const OTP    = require('../models/OTP');
const logger = require('../utils/logger');

const OTP_EXPIRY_MINUTES = parseInt(process.env.OTP_EXPIRY_MINUTES) || 10;
const MAX_ATTEMPTS       = parseInt(process.env.OTP_MAX_ATTEMPTS)   || 5;

const AUTH_KEY    = process.env.MSG91_AUTH_KEY;
const TEMPLATE_ID = process.env.MSG91_OTP_TEMPLATE_ID;
const SENDER_ID   = process.env.MSG91_SENDER_ID   || 'SFRSHR';
const FLOW_ID     = process.env.MSG91_SMS_FLOW_ID;
const BASE_URL    = 'https://api.msg91.com/api/v5';

// MSG91 format: 91XXXXXXXXXX (no +, no spaces)
const formatPhone = (phone) => {
  const d = phone.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) return d;
  if (d.length === 10) return `91${d}`;
  return d;
};

// ── sendOTP ──────────────────────────────────────────────────────────────────
// Generates a 6-digit OTP, hashes it in MongoDB, sends via MSG91.
// Dev mode: logs to console only — zero API cost during development.
//
// MSG91 OTP template must use ##OTP## placeholder e.g.:
//   "Your SafarShare OTP is ##OTP##. Valid for 10 minutes. - SFRSHR"
// ─────────────────────────────────────────────────────────────────────────────
const sendOTP = async (phone, purpose = 'register') => {
  try {
    await OTP.deleteMany({ phone, purpose });

    const otp       = crypto.randomInt(100000, 999999).toString();
    const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

    await OTP.create({ phone, otp: hashedOtp, purpose, expiresAt });

    // Dev — skip API
    if (process.env.NODE_ENV !== 'production') {
      logger.info(`[DEV OTP] ${phone} → ${otp} (${purpose})`);
      return { success: true, message: 'OTP logged to console (dev mode)' };
    }

    const response = await axios.post(
      `${BASE_URL}/otp`,
      {
        authkey:     AUTH_KEY,
        template_id: TEMPLATE_ID,
        mobile:      formatPhone(phone),
        otp,
        otp_length:  6,
        otp_expiry:  OTP_EXPIRY_MINUTES,
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 8000 }
    );

    if (response.data?.type === 'success') {
      logger.info(`[MSG91] OTP sent → ${phone} (${purpose})`);
      return { success: true, message: 'OTP sent successfully' };
    }

    throw new Error(response.data?.message || 'MSG91 send failed');

  } catch (error) {
    logger.error(`sendOTP error [${phone}]: ${error.message}`);
    throw new Error('Failed to send OTP. Please check your number and try again.');
  }
};

// ── verifyOTP ─────────────────────────────────────────────────────────────────
// Checks entered code against hashed value in MongoDB.
// Enforces expiry and max attempt limit. One-time use only.
// ─────────────────────────────────────────────────────────────────────────────
const verifyOTP = async (phone, otp, purpose) => {
  try {
    const record = await OTP.findOne({ phone, purpose, isUsed: false });

    if (!record)
      return { success: false, message: 'OTP not found or already used. Please request a new one.' };

    if (new Date() > record.expiresAt) {
      await OTP.deleteOne({ _id: record._id });
      return { success: false, message: 'OTP has expired. Please request a new one.' };
    }

    if (record.attempts >= MAX_ATTEMPTS) {
      await OTP.deleteOne({ _id: record._id });
      return { success: false, message: 'Too many incorrect attempts. Please request a new OTP.' };
    }

    const hashedInput = crypto.createHash('sha256').update(otp.toString()).digest('hex');

    if (hashedInput !== record.otp) {
      await OTP.updateOne({ _id: record._id }, { $inc: { attempts: 1 } });
      const left = MAX_ATTEMPTS - record.attempts - 1;
      return { success: false, message: `Incorrect OTP. ${left} attempt${left !== 1 ? 's' : ''} remaining.` };
    }

    await OTP.deleteOne({ _id: record._id });
    return { success: true, message: 'OTP verified successfully' };

  } catch (error) {
    logger.error(`verifyOTP error [${phone}]: ${error.message}`);
    throw new Error('OTP verification failed. Please try again.');
  }
};

// ── sendSMS ───────────────────────────────────────────────────────────────────
// Transactional SMS via MSG91 Flow API.
// Used for: booking alerts, cancellations, driver approval notices.
// Never throws — a failed SMS should never crash a request.
// ─────────────────────────────────────────────────────────────────────────────
const sendSMS = async (phone, message) => {
  try {
    if (process.env.NODE_ENV !== 'production') {
      logger.info(`[DEV SMS] → ${phone}\n${message}`);
      return;
    }

    if (!FLOW_ID) {
      logger.warn('MSG91_SMS_FLOW_ID not set — skipping SMS');
      return;
    }

    await axios.post(
      `${BASE_URL}/flow`,
      {
        flow_id: FLOW_ID,
        sender:  SENDER_ID,
        mobiles: formatPhone(phone),
        message,
      },
      {
        headers: { authkey: AUTH_KEY, 'Content-Type': 'application/json' },
        timeout: 8000,
      }
    );

    logger.info(`[MSG91] SMS sent → ${phone}`);

  } catch (error) {
    logger.error(`sendSMS error [${phone}]: ${error.message}`);
    // Intentionally not re-thrown
  }
};

// ── sendPanicAlert ────────────────────────────────────────────────────────────
// Emergency SMS to all saved emergency contacts when panic button is held.
// Contains passenger name, live Google Maps link, driver info, IST timestamp.
// ─────────────────────────────────────────────────────────────────────────────
const sendPanicAlert = async (user, location, booking) => {
  const contacts = user.emergencyContacts || [];

  if (!contacts.length) {
    logger.warn(`Panic by ${user._id} — no emergency contacts saved`);
    return;
  }

  const mapsUrl    = `https://maps.google.com/?q=${location.lat},${location.lng}`;
  const driverName = booking.driver?.firstName
    ? `${booking.driver.firstName} ${booking.driver.lastName}`
    : 'Unknown';
  const vehicleNum = booking.driver?.driverInfo?.vehicleNumber || '';
  const timeIST    = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  const message = [
    `EMERGENCY ALERT - SafarShare`,
    ``,
    `${user.firstName} ${user.lastName} has triggered the PANIC button during their ride.`,
    ``,
    `Live Location: ${mapsUrl}`,
    `Driver: ${driverName}${vehicleNum ? ` (${vehicleNum})` : ''}`,
    `Time: ${timeIST} IST`,
    ``,
    `Contact them immediately or dial 112.`,
    `- SafarShare Safety Team`,
  ].join('\n');

  const results = await Promise.allSettled(
    contacts.map((c) => sendSMS(c.phone, message))
  );

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  logger.warn(`Panic alert: ${sent}/${contacts.length} sent — user ${user._id}`);
};

module.exports = { sendOTP, verifyOTP, sendSMS, sendPanicAlert };
