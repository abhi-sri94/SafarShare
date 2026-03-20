const mongoose = require('mongoose');

const stopSchema = new mongoose.Schema({
  city:      { type: String, required: true },
  address:   { type: String },
  coordinates: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: [Number], // [lng, lat]
  },
  arrivalTime:   { type: Date },
  departureTime: { type: Date },
}, { _id: false });

const rideSchema = new mongoose.Schema({
  driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Route
  origin: {
    city:    { type: String, required: true },
    address: { type: String },
    coordinates: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true }, // [lng, lat]
    },
  },
  destination: {
    city:    { type: String, required: true },
    address: { type: String },
    coordinates: {
      type: { type: String, enum: ['Point'], default: 'Point' },
      coordinates: { type: [Number], required: true },
    },
  },
  stops: [stopSchema],

  // Schedule
  departureTime: { type: Date, required: true },
  estimatedArrivalTime: { type: Date },
  durationMinutes: { type: Number },
  distanceKm: { type: Number },

  // Pricing
  pricePerSeat: { type: Number, required: true, min: 50, max: 5000 },
  totalSeats:   { type: Number, required: true, min: 1, max: 6 },
  seatsBooked:  { type: Number, default: 0 },
  seatsAvailable: { type: Number },

  // Vehicle
  vehicleModel:  { type: String },
  vehicleNumber: { type: String },

  // Status
  status: {
    type: String,
    enum: ['scheduled', 'active', 'in_progress', 'completed', 'cancelled'],
    default: 'scheduled',
  },
  cancelledBy:  { type: String, enum: ['driver', 'admin'] },
  cancelReason: { type: String },
  cancelledAt:  { type: Date },

  // Preferences
  preferences: {
    womenOnly:      { type: Boolean, default: false },
    smokingAllowed: { type: Boolean, default: false },
    musicAllowed:   { type: Boolean, default: true },
    luggageAllowed: { type: Boolean, default: true },
    acAvailable:    { type: Boolean, default: false },
    petsAllowed:    { type: Boolean, default: false },
  },

  // Tracking (driver's live location during ride)
  currentLocation: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: [Number],
  },
  routePolyline: { type: String }, // Encoded Google Maps polyline

  // Driver penalty tracking
  penaltyApplied: { type: Boolean, default: false },

  // Aggregated rating for this ride
  averageRating: { type: Number, default: 0 },
  ratingCount:   { type: Number, default: 0 },

  // Extra
  notes: { type: String, maxlength: 300 },
  isRecurring: { type: Boolean, default: false },
  recurringDays: [{ type: String, enum: ['mon','tue','wed','thu','fri','sat','sun'] }],
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Indexes
rideSchema.index({ 'origin.coordinates': '2dsphere' });
rideSchema.index({ 'destination.coordinates': '2dsphere' });
rideSchema.index({ driver: 1, status: 1 });
rideSchema.index({ departureTime: 1, status: 1 });
rideSchema.index({ 'origin.city': 1, 'destination.city': 1, departureTime: 1 });

// Virtual: seats available
rideSchema.virtual('seatsLeft').get(function () {
  return this.totalSeats - this.seatsBooked;
});

// Pre-save: auto-calc seatsAvailable
rideSchema.pre('save', function (next) {
  this.seatsAvailable = this.totalSeats - this.seatsBooked;
  next();
});

module.exports = mongoose.model('Ride', rideSchema);
