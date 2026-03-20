const Razorpay = require('razorpay');
const crypto = require('crypto');
const Payment = require('../models/Payment');
const Booking = require('../models/Booking');
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
    const amountPaise = Math.round(booking.totalAmount * 100); // Razorpay uses paise

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency: 'INR',
      receipt: `booking_${booking._id}`,
      notes: {
        bookingId: booking._id.toString(),
        passengerId: booking.passenger.toString(),
        rideId: booking.ride.toString(),
      },
    });

    // Create payment record
    await Payment.create({
      booking: booking._id,
      payer: booking.passenger,
      receiver: booking.driver,
      amount: booking.totalAmount,
      razorpayOrderId: order.id,
      status: 'created',
    });

    logger.info(`Razorpay order created: ${order.id} for booking ${booking._id}`);

    return {
      orderId: order.id,
      amount: amountPaise,
      currency: 'INR',
      keyId: process.env.RAZORPAY_KEY_ID,
    };
  } catch (error) {
    logger.error('createOrder error:', error.message);
    throw new Error('Failed to create payment order. Please try again.');
  }
};

/**
 * Verify Razorpay payment signature and capture
 */
const verifyAndCapturePayment = async ({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) => {
  try {
    // Verify signature
    const body = `${razorpayOrderId}|${razorpayPaymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpaySignature) {
      logger.warn(`Invalid Razorpay signature for order ${razorpayOrderId}`);
      return { success: false, message: 'Payment signature verification failed.' };
    }

    // Fetch payment from Razorpay
    const payment = await razorpay.payments.fetch(razorpayPaymentId);

    // Update payment record
    const paymentRecord = await Payment.findOneAndUpdate(
      { razorpayOrderId },
      {
        razorpayPaymentId,
        razorpaySignature,
        status: 'captured',
        paymentMethod: payment.method,
        gatewayMetadata: payment,
      },
      { new: true }
    );

    if (!paymentRecord) {
      throw new Error('Payment record not found');
    }

    // Update booking status
    await Booking.findByIdAndUpdate(paymentRecord.booking, { status: 'confirmed' });

    logger.info(`Payment captured: ${razorpayPaymentId} for order ${razorpayOrderId}`);
    return { success: true, paymentRecord };

  } catch (error) {
    logger.error('verifyAndCapturePayment error:', error.message);
    throw new Error('Payment verification failed. Contact support if money was deducted.');
  }
};

/**
 * Process refund via Razorpay
 */
const processRefund = async (paymentId, amount, reason) => {
  try {
    const payment = await Payment.findOne({ razorpayPaymentId: paymentId });
    if (!payment) throw new Error('Payment not found');

    const refundAmountPaise = Math.round(amount * 100);

    const refund = await razorpay.payments.refund(paymentId, {
      amount: refundAmountPaise,
      notes: { reason },
    });

    await Payment.findByIdAndUpdate(payment._id, {
      refundId: refund.id,
      refundAmount: amount,
      refundReason: reason,
      refundedAt: new Date(),
      status: amount >= payment.amount ? 'refunded' : 'partially_refunded',
    });

    logger.info(`Refund processed: ${refund.id} for payment ${paymentId}`);
    return { success: true, refundId: refund.id, amount };

  } catch (error) {
    logger.error('processRefund error:', error.message);
    throw new Error('Refund processing failed. Please contact support.');
  }
};

/**
 * Payout to driver (Razorpay Payouts)
 */
const payoutToDriver = async (booking, driver) => {
  try {
    // Razorpay Payouts require a contact + fund account setup
    // This is a simplified implementation
    const payoutAmount = Math.round(booking.driverPayout * 100);

    // In production, use Razorpay Payouts API:
    // const payout = await razorpay.payouts.create({ ... })

    await Payment.findOneAndUpdate(
      { booking: booking._id },
      { payoutStatus: 'paid', payoutAt: new Date() }
    );

    logger.info(`Payout of ₹${booking.driverPayout} queued for driver ${driver._id}`);
    return { success: true, amount: booking.driverPayout };

  } catch (error) {
    logger.error('payoutToDriver error:', error.message);
    throw error;
  }
};

/**
 * Calculate price breakdown
 */
const calculatePriceBreakdown = (pricePerSeat, seats) => {
  const subtotal = pricePerSeat * seats;
  const platformFee = Math.round(subtotal * COMMISSION);
  const driverPayout = subtotal - platformFee;
  return { subtotal, platformFee, driverPayout, totalAmount: subtotal };
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

    if (expectedSignature !== signature) {
      logger.warn('Invalid webhook signature');
      return false;
    }

    const event = JSON.parse(body);
    logger.info(`Razorpay webhook: ${event.event}`);

    switch (event.event) {
      case 'payment.captured':
        await Payment.findOneAndUpdate(
          { razorpayPaymentId: event.payload.payment.entity.id },
          { status: 'captured' }
        );
        break;
      case 'payment.failed':
        await Payment.findOneAndUpdate(
          { razorpayOrderId: event.payload.payment.entity.order_id },
          { status: 'failed' }
        );
        break;
      case 'refund.processed':
        logger.info(`Refund processed: ${event.payload.refund.entity.id}`);
        break;
    }
    return true;
  } catch (error) {
    logger.error('handleWebhook error:', error.message);
    return false;
  }
};

module.exports = { createOrder, verifyAndCapturePayment, processRefund, payoutToDriver, calculatePriceBreakdown, handleWebhook };
