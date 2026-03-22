const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');
const Booking = require('../models/Booking');
const logger = require('../utils/logger');

let io;

const initSocket = (server) => {
  const allowedOrigins = (() => {
    const envList = (process.env.FRONTEND_URL || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);

    const defaults = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:5500',
      'http://127.0.0.1:5500',
      'http://localhost:5501',
      'http://127.0.0.1:5501',
      'http://localhost:5502',
      'http://127.0.0.1:5502',
      'https://safarshare-web.vercel.app',
      'https://app.safarshare.in',
    ];

    return Array.from(new Set([...envList, ...defaults]));
  })();

  io = new Server(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // ── Auth middleware ──────────────────────────────────────────────────────
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      if (!token) return next(new Error('Authentication required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('firstName lastName profilePhoto role isBanned');

      if (!user || user.isBanned) return next(new Error('User not authorized'));

      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  // ── Connection handler ───────────────────────────────────────────────────
  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.user._id} (${socket.user.firstName})`);

    // Join personal room for direct notifications
    socket.join(`user_${socket.user._id}`);

    // ── JOIN CHAT ROOM ───────────────────────────────────────────────────
    socket.on('join_booking', async ({ bookingId }) => {
      try {
        const booking = await Booking.findById(bookingId);
        if (!booking) return socket.emit('error', { message: 'Booking not found' });

        const isParty = [booking.passenger.toString(), booking.driver.toString()]
          .includes(socket.user._id.toString());
        if (!isParty) return socket.emit('error', { message: 'Not authorized for this booking' });

        socket.join(`booking_${bookingId}`);
        socket.currentBooking = bookingId;

        // Load last 50 messages
        const messages = await Message.find({ booking: bookingId })
          .populate('sender', 'firstName lastName profilePhoto')
          .sort({ createdAt: 1 })
          .limit(50);

        socket.emit('message_history', messages);

        // Mark unread messages as read
        await Message.updateMany(
          { booking: bookingId, receiver: socket.user._id, isRead: false },
          { isRead: true, readAt: new Date() }
        );

        logger.info(`User ${socket.user._id} joined booking room: ${bookingId}`);
      } catch (err) {
        socket.emit('error', { message: 'Failed to join room' });
      }
    });

    // ── SEND MESSAGE ─────────────────────────────────────────────────────
    socket.on('send_message', async ({ bookingId, text, type = 'text', location }) => {
      try {
        const booking = await Booking.findById(bookingId);
        if (!booking) return;

        const receiverId = booking.passenger.toString() === socket.user._id.toString()
          ? booking.driver
          : booking.passenger;

        const message = await Message.create({
          booking: bookingId,
          sender: socket.user._id,
          receiver: receiverId,
          type,
          text: type === 'text' ? text : undefined,
          location: type === 'location' ? location : undefined,
        });

        await message.populate('sender', 'firstName lastName profilePhoto');

        // Emit to both users in room
        io.to(`booking_${bookingId}`).emit('new_message', message);

        // Push notification if receiver is offline
        const receiver = await User.findById(receiverId).select('fcmToken');
        if (receiver?.fcmToken) {
          const { notifyNewMessage } = require('../services/firebaseService');
          await notifyNewMessage(receiver, socket.user, text || 'Shared a location');
        }

      } catch (err) {
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // ── TYPING INDICATOR ─────────────────────────────────────────────────
    socket.on('typing', ({ bookingId, isTyping }) => {
      socket.to(`booking_${bookingId}`).emit('user_typing', {
        userId: socket.user._id,
        name: socket.user.firstName,
        isTyping,
      });
    });

    // ── JOIN RIDE TRACKING ROOM ──────────────────────────────────────────
    socket.on('join_ride_tracking', async ({ rideId }) => {
      socket.join(`ride_${rideId}`);
      logger.info(`User ${socket.user._id} joined tracking room: ride_${rideId}`);
    });

    // ── DRIVER LOCATION UPDATE ───────────────────────────────────────────
    socket.on('driver_location', async ({ rideId, lat, lng, speed, heading }) => {
      try {
        // Update DB (throttled — only persist every 5th update)
        if (Math.random() < 0.2) {
          const Ride = require('../models/Ride');
          await Ride.findByIdAndUpdate(rideId, {
            currentLocation: { type: 'Point', coordinates: [lng, lat] },
          });
          await User.findByIdAndUpdate(socket.user._id, {
            'driverInfo.currentLocation': { type: 'Point', coordinates: [lng, lat] },
          });
        }

        // Always broadcast to passengers tracking this ride
        socket.to(`ride_${rideId}`).emit('location_update', {
          lat, lng, speed, heading,
          timestamp: new Date(),
          driverId: socket.user._id,
        });
      } catch (err) {
        logger.error('Driver location update error:', err.message);
      }
    });

    // ── ONLINE STATUS ────────────────────────────────────────────────────
    socket.on('driver_online', async ({ isOnline }) => {
      await User.findByIdAndUpdate(socket.user._id, { 'driverInfo.isOnline': isOnline });
      logger.info(`Driver ${socket.user._id} is now ${isOnline ? 'online' : 'offline'}`);
    });

    // ── DISCONNECT ───────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      logger.info(`Socket disconnected: ${socket.user._id}`);
      // Mark driver offline on disconnect
      if (socket.user.role === 'driver' || socket.user.role === 'both') {
        await User.findByIdAndUpdate(socket.user._id, { 'driverInfo.isOnline': false }).catch(() => {});
      }
    });
  });

  logger.info('Socket.io initialized');
  return io;
};

const getIO = () => {
  if (!io) throw new Error('Socket.io not initialized');
  return io;
};

// Helper: emit to a specific user
const emitToUser = (userId, event, data) => {
  if (io) io.to(`user_${userId}`).emit(event, data);
};

module.exports = { initSocket, getIO, emitToUser };
