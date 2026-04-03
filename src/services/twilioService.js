/**
 * twilioService.js
 * SMS/WhatsApp layer powered by MSG91 (using Supabase for OTP storage)
 */

const axios = require('axios');
const crypto = require('crypto');
const supabase = require('../config/supabase');
const logger = require('../utils/logger');

const OTP_EXPIRY_MINUTES = parseInt(process.env.OTP_EXPIRY_MINUTES) || 10;
const MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS) || 5;

const AUTH_KEY = '462793ANWxhhvUbfxr69be35afP1';
const TEMPLATE_ID = '69b90a681dee2927e60619d2'; 
const BASE_URL = 'https://api.msg91.com/api/v5';

const formatPhone = (phone) => {
  const clean = phone.replace(/\D/g, '');
  return clean.length === 10 ? `91${clean}` : clean;
};

const sendOTP = async (phone, purpose = 'register') => {
  try {
    await supabase.from('otps').delete().eq('phone', phone).eq('purpose', purpose);

    const otp = crypto.randomInt(100000, 999999).toString();
    const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();

    await supabase.from('otps').insert({ phone, otp: hashedOtp, purpose, expires_at: expiresAt });

    if (process.env.NODE_ENV !== 'production') {
      logger.info(`[DEV OTP] ${phone} → ${otp}`);
      return { success: true, message: 'OTP logged to console' };
    }

    const response = await axios.post(`${BASE_URL}/otp`, {
      authkey: AUTH_KEY,
      template_id: TEMPLATE_ID,
      mobile: formatPhone(phone),
      otp,
      otp_length: 6,
      otp_expiry: OTP_EXPIRY_MINUTES,
      whatsapp: 1,
    });

    if (response.data?.type === 'success') {
      return { success: true, message: 'OTP sent' };
    }
    throw new Error(response.data?.message || 'MSG91 send failed');
  } catch (error) {
    logger.error(`sendOTP error [${phone}]: ${error.message}`);
    throw new Error('Failed to send OTP.');
  }
};

const verifyOTP = async (phone, otp, purpose) => {
  try {
    const { data: record, error } = await supabase
      .from('otps')
      .select('*')
      .eq('phone', phone)
      .eq('purpose', purpose)
      .eq('is_used', false)
      .maybeSingle();

    if (error || !record) return { success: false, message: 'OTP not found.' };

    if (new Date() > new Date(record.expires_at)) {
      await supabase.from('otps').delete().eq('id', record.id);
      return { success: false, message: 'OTP expired.' };
    }

    if (record.attempts >= MAX_ATTEMPTS) {
      await supabase.from('otps').delete().eq('id', record.id);
      return { success: false, message: 'Too many attempts.' };
    }

    const hashedInput = crypto.createHash('sha256').update(otp.toString()).digest('hex');

    if (hashedInput !== record.otp) {
      await supabase.from('otps').update({ attempts: record.attempts + 1 }).eq('id', record.id);
      return { success: false, message: 'Incorrect OTP.' };
    }

    await supabase.from('otps').delete().eq('id', record.id);
    return { success: true, message: 'Verified.' };
  } catch (error) {
    logger.error(`verifyOTP error [${phone}]: ${error.message}`);
    throw error;
  }
};

const sendPanicAlert = async (user, location, booking) => {
  const contacts = user.emergency_contacts || [];
  if (!contacts.length) return;

  const mapsUrl = `https://maps.google.com/?q=${location.lat},${location.lng}`;
  const driverName = booking.driver?.first_name ? `${booking.driver.first_name} ${booking.driver.last_name || ''}` : 'Unknown';
  
  const message = `EMERGENCY SAFE ALERT: ${user.first_name} triggered panic button. Location: ${mapsUrl}. Driver: ${driverName}.`;
  
  // In real app, loop and sendSMS. For now, log.
  logger.warn(`PANIC ALERT by ${user.id}: ${message}`);
};

module.exports = { sendOTP, verifyOTP, sendPanicAlert };
