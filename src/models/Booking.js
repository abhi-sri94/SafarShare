const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  ride:      { type: mongoose.Schema.Types.ObjectId, ref: 'Ride', required: true },
  passenger: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  driver:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  seatsBooked: { type: Number, required: true, min: 1, max: 4 },

  // Pricing breakdown
  pricePerSeat:     { type: Number, required: true },
  subtotal:         { type: Number, required: true }, // pricePerSeat * seatsBooked
  platformFee:      { type: Number, required: true }, // subtotal * commissionPercent / 100
  totalAmount:      { type: Number, required: true }, // subtotal (passenger pays)
  driverPayout:     { type: Number, required: true }, // subtotal - platformFee

  // Booking lifecycle
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'refunded'],
    default: 'pending',
  },

  // Pickup / drop details (can differ from ride origin/destination for stops)
  pickupPoint: {
    city:    String,
    address: String,
    coordinates: { lat: Number, lng: Number },
  },
  dropPoint: {
    city:    String,
    address: String,
    coordinates: { lat: Number, lng: Number },
  },

  // Cancellation
  cancelledBy:  { type: String, enum: ['passenger', 'driver', 'admin', 'system'] },
  cancelReason: { type: String },
  cancelledAt:  { type: Date },
  refundAmount: { type: Number, default: 0 },
  refundStatus: { type: String, enum: ['none', 'pending', 'processed'], default: 'none' },

  // Ratings (after trip)
  passengerRatedDriver:   { type: Boolean, default: false },
  driverRatedPassenger:   { type: Boolean, default: false },
  passengerRating:        { type: Number, min: 1, max: 5 },
  driverGivenRating:      { type: Number, min: 1, max: 5 },
  passengerReview:        { type: String, maxlength: 500 },
  driverReview:           { type: String, maxlength: 500 },
  ratedAt:                { type: Date },

  // Emergency
  panicTriggered:  { type: Boolean, default: false },
  panicAt:         { type: Date },
  panicLocation:   { lat: Number, lng: Number },
  panicResolvedAt: { type: Date },

  // Timestamps for ride lifecycle
  startedAt:   { type: Date },
  completedAt: { type: Date },

  // QR code for boarding verification
  boardingCode: { type: String },

  // Special requirements
  notes: { type: String, maxlength: 200 },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
});

// Indexes
bookingSchema.index({ ride: 1 });
bookingSchema.index({ passenger: 1, status: 1 });
bookingSchema.index({ driver: 1, status: 1 });
bookingSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Booking', bookingSchema);
