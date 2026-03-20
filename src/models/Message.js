const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  booking:  { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
  sender:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  receiver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  type: {
    type: String,
    enum: ['text', 'location', 'image', 'system'],
    default: 'text',
  },

  text: { type: String, maxlength: 1000 },

  // For location messages
  location: {
    lat: Number,
    lng: Number,
    address: String,
  },

  // For image messages
  imageUrl: { type: String },

  // Delivery status
  isRead:    { type: Boolean, default: false },
  readAt:    { type: Date },
  isDeleted: { type: Boolean, default: false },
}, {
  timestamps: true,
});

messageSchema.index({ booking: 1, createdAt: 1 });
messageSchema.index({ sender: 1, receiver: 1 });

module.exports = mongoose.model('Message', messageSchema);
