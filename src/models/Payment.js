const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  booking:  { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
  payer:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // driver

  amount:   { type: Number, required: true },
  currency: { type: String, default: 'INR' },

  // Razorpay IDs
  razorpayOrderId:    { type: String },
  razorpayPaymentId:  { type: String },
  razorpaySignature:  { type: String },

  paymentMethod: {
    type: String,
    enum: ['upi', 'card', 'netbanking', 'wallet', 'cash', 'safarshare_wallet'],
  },

  status: {
    type: String,
    enum: ['created', 'pending', 'captured', 'failed', 'refunded', 'partially_refunded'],
    default: 'created',
  },

  // Payout to driver
  payoutStatus: {
    type: String,
    enum: ['pending', 'processing', 'paid', 'failed'],
    default: 'pending',
  },
  payoutId:  { type: String }, // Razorpay payout ID
  payoutAt:  { type: Date },

  // Refund details
  refundId:     { type: String },
  refundAmount: { type: Number, default: 0 },
  refundReason: { type: String },
  refundedAt:   { type: Date },

  // Receipt
  receiptNumber: { type: String, unique: true },

  // Metadata from Razorpay
  gatewayMetadata: { type: mongoose.Schema.Types.Mixed },
}, {
  timestamps: true,
});

// Indexes
paymentSchema.index({ booking: 1 });
paymentSchema.index({ razorpayOrderId: 1 });
paymentSchema.index({ razorpayPaymentId: 1 });
paymentSchema.index({ payer: 1, status: 1 });

// Auto-generate receipt number
paymentSchema.pre('save', function (next) {
  if (!this.receiptNumber) {
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.receiptNumber = `SS-${ts}-${rand}`;
  }
  next();
});

module.exports = mongoose.model('Payment', paymentSchema);
