const Razorpay = require('razorpay');
const crypto = require('crypto');
const supabase = require('../config/supabase');
const logger = require('../utils/logger');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const COMMISSION = parseFloat(process.env.PLATFORM_COMMISSION_PERCENT) / 100 || 0.13;

/**
 * Create a Razorpay order for booking payment
 */
const createOrder = async (booking) => {
  try {
    const amountPaise = Math.round(booking.total_amount * 100);

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `booking_${booking.id}`,
      notes: {
        bookingId: booking.id,
        passengerId: booking.passenger_id,
        rideId: booking.ride_id,
      },
    });

    // Create payment record
    await supabase.from('payments').insert({
      booking_id: booking.id,
      payer_id: booking.passenger_id,
      receiver_id: booking.driver_id,
      amount: booking.total_amount,
      razorpay_order_id: order.id,
      status: 'created',
    });

    logger.info(`Razorpay order created: ${order.id} for booking ${booking.id}`);

    return {
      orderId: order.id,
      amount: amountPaise,
      currency: 'INR',
      keyId: process.env.RAZORPAY_KEY_ID,
    };
  } catch (error) {
    logger.error('createOrder error:', error.message);
    throw new Error('Failed to create payment order.');
  }
};

/**
 * Verify Razorpay payment signature and capture
 */
const verifyAndCapturePayment = async ({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) => {
  try {
    const body = `${razorpayOrderId}|${razorpayPaymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpaySignature) {
      return { success: false, message: 'Signature verification failed.' };
    }

    const payment = await razorpay.payments.fetch(razorpayPaymentId);

    const { data: paymentRecord, error } = await supabase
      .from('payments')
      .update({
        razorpay_payment_id: razorpayPaymentId,
        razorpay_signature: razorpaySignature,
        status: 'captured',
        payment_method: payment.method,
        gateway_metadata: payment,
      })
      .eq('razorpay_order_id', razorpayOrderId)
      .select()
      .single();

    if (error || !paymentRecord) throw new Error('Payment record not found');

    await supabase.from('bookings').update({ status: 'confirmed' }).eq('id', paymentRecord.booking_id);

    logger.info(`Payment captured: ${razorpayPaymentId}`);
    return { success: true, paymentRecord };
  } catch (error) {
    logger.error('verifyAndCapturePayment error:', error.message);
    throw error;
  }
};

/**
 * Handle Razorpay webhook events
 */
const handleWebhook = async (body, signature) => {
  try {
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSignature !== signature) return false;

    const event = JSON.parse(body);
    const pRecord = event.payload.payment.entity;

    if (event.event === 'payment.captured') {
      await supabase.from('payments').update({ status: 'captured' }).eq('razorpay_payment_id', pRecord.id);
    } else if (event.event === 'payment.failed') {
      await supabase.from('payments').update({ status: 'failed' }).eq('razorpay_order_id', pRecord.order_id);
    }
    
    return true;
  } catch (error) {
    logger.error('handleWebhook error:', error.message);
    return false;
  }
};

const calculatePriceBreakdown = (pricePerSeat, seats) => {
  const subtotal = pricePerSeat * seats;
  const platformFee = Math.round(subtotal * COMMISSION);
  const driverPayout = subtotal - platformFee;
  return { subtotal, platformFee, driverPayout, totalAmount: subtotal };
};

module.exports = { createOrder, verifyAndCapturePayment, calculatePriceBreakdown, handleWebhook };
