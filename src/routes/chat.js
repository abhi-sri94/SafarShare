const express = require('express');
const Message = require('../models/Message');
const Booking = require('../models/Booking');
const { protect } = require('../middleware/auth');
const AppError = require('../utils/AppError');

const router = express.Router();

// ── GET /api/chat/:bookingId/messages ─────────────────────────────────────
router.get('/:bookingId/messages', protect, async (req, res, next) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) return next(new AppError('Booking not found.', 404));

    const isParty = [booking.passenger.toString(), booking.driver.toString()]
      .includes(req.user._id.toString());
    if (!isParty) return next(new AppError('Not authorized.', 403));

    const { page = 1, limit = 50 } = req.query;
    const messages = await Message.find({ booking: req.params.bookingId })
      .populate('sender', 'firstName lastName profilePhoto')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    // Mark as read
    await Message.updateMany(
      { booking: req.params.bookingId, receiver: req.user._id, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    res.json({
      success: true,
      count: messages.length,
      data: { messages: messages.reverse() },
    });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/chat/unread-count ─────────────────────────────────────────────
router.get('/unread/count', protect, async (req, res, next) => {
  try {
    const count = await Message.countDocuments({ receiver: req.user._id, isRead: false });
    res.json({ success: true, data: { unreadCount: count } });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/chat/conversations ────────────────────────────────────────────
router.get('/conversations/list', protect, async (req, res, next) => {
  try {
    // Get all bookings for this user with messages
    const bookings = await Booking.find({
      $or: [{ passenger: req.user._id }, { driver: req.user._id }],
      status: { $in: ['confirmed', 'in_progress', 'completed'] },
    })
      .populate('passenger', 'firstName lastName profilePhoto')
      .populate('driver', 'firstName lastName profilePhoto driverInfo.vehicleModel')
      .populate('ride', 'origin destination departureTime')
      .sort({ updatedAt: -1 })
      .limit(20);

    // Get latest message + unread count per booking
    const conversations = await Promise.all(bookings.map(async (b) => {
      const lastMessage = await Message.findOne({ booking: b._id }).sort({ createdAt: -1 }).select('text type createdAt sender');
      const unread = await Message.countDocuments({ booking: b._id, receiver: req.user._id, isRead: false });
      const other = b.passenger._id.toString() === req.user._id.toString() ? b.driver : b.passenger;
      return { booking: b, other, lastMessage, unreadCount: unread };
    }));

    res.json({ success: true, data: { conversations } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
