const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');
const logger = require('../utils/logger');

let io;

const initSocket = (server) => {
  const allowedOrigins = (process.env.FRONTEND_URL || '').split(',').map(s => s.trim()).filter(Boolean);

  io = new Server(server, {
    cors: {
      origin: allowedOrigins.includes('*') ? true : allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      if (!token) return next(new Error('Auth required'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const { data: user } = await supabase.from('users').select('*').eq('id', decoded.id).single();

      if (!user || user.is_banned) return next(new Error('Unauthorized'));

      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.user.id}`);
    socket.join(`user_${socket.user.id}`);

    socket.on('join_booking', async ({ bookingId }) => {
      try {
        const { data: booking } = await supabase.from('bookings').select('*').eq('id', bookingId).single();
        if (!booking) return socket.emit('error', 'Booking not found');

        const isParty = [booking.passenger_id, booking.driver_id].includes(socket.user.id);
        if (!isParty) return socket.emit('error', 'Unauthorized');

        socket.join(`booking_${bookingId}`);
        
        const { data: messages } = await supabase
          .from('messages')
          .select('*, sender:users(*)')
          .eq('booking_id', bookingId)
          .order('created_at', { ascending: true })
          .limit(50);

        socket.emit('message_history', messages);
        await supabase.from('messages').update({ is_read: true }).eq('booking_id', bookingId).eq('receiver_id', socket.user.id);
      } catch (err) {
        socket.emit('error', 'Join failed');
      }
    });

    socket.on('send_message', async ({ bookingId, text, type = 'text', location }) => {
      try {
        const { data: booking } = await supabase.from('bookings').select('*').eq('id', bookingId).single();
        if (!booking) return;

        const receiverId = booking.passenger_id === socket.user.id ? booking.driver_id : booking.passenger_id;

        const { data: message } = await supabase.from('messages').insert({
          booking_id: bookingId,
          sender_id: socket.user.id,
          receiver_id: receiverId,
          type,
          text: type === 'text' ? text : null,
          location: type === 'location' ? location : null,
        }).select('*, sender:users(*)').single();

        io.to(`booking_${bookingId}`).emit('new_message', message);
        
        const { data: receiver } = await supabase.from('users').select('fcm_token').eq('id', receiverId).single();
        if (receiver?.fcm_token) {
          const { notifyNewMessage } = require('../services/firebaseService');
          await notifyNewMessage(receiver, socket.user, text || 'Shared a location');
        }
      } catch (err) {
        socket.emit('error', 'Send failed');
      }
    });

    socket.on('driver_location', async ({ rideId, lat, lng }) => {
      try {
        if (Math.random() < 0.2) {
          await supabase.from('rides').update({ current_location: { lat, lng } }).eq('id', rideId);
          await supabase.from('users').update({ driver_info: { ...socket.user.driver_info, current_location: { lat, lng } } }).eq('id', socket.user.id);
        }
        socket.to(`ride_${rideId}`).emit('location_update', { lat, lng, driverId: socket.user.id });
      } catch (err) {
        logger.error('Location error:', err.message);
      }
    });

    socket.on('disconnect', () => {
      logger.info(`Disconnected: ${socket.user.id}`);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) throw new Error('Socket.io not init');
  return io;
};

const emitToUser = (userId, event, data) => {
  if (io) io.to(`user_${userId}`).emit(event, data);
};

module.exports = { initSocket, getIO, emitToUser };
