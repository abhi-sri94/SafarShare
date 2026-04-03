import { io } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BASE_URL } from './api';

let socket = null;

export const connectSocket = async () => {
  if (socket?.connected) return socket;
  const token = await AsyncStorage.getItem('ss_token');
  if (!token) return null;

  socket = io(BASE_URL.replace('/api', ''), {
    auth: { token },
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionAttempts: 5,
    transports: ['websocket'],
  });

  socket.on('connect', () => console.log('[Socket] Connected:', socket.id));
  socket.on('disconnect', (reason) => console.log('[Socket] Disconnected:', reason));
  socket.on('connect_error', (err) => console.warn('[Socket] Error:', err.message));

  return socket;
};

export const disconnectSocket = () => {
  if (socket) { socket.disconnect(); socket = null; }
};

export const getSocket = () => socket;

// ── Chat ─────────────────────────────────────────────────────────────────
export const joinBookingRoom = (bookingId) => {
  socket?.emit('join_booking', { bookingId });
};

export const sendChatMessage = (bookingId, text, type = 'text', location = null) => {
  socket?.emit('send_message', { bookingId, text, type, location });
};

export const sendTyping = (bookingId, isTyping) => {
  socket?.emit('typing', { bookingId, isTyping });
};

export const sendLocationMessage = (bookingId, lat, lng, address) => {
  socket?.emit('send_message', { bookingId, type: 'location', location: { lat, lng, address } });
};

// ── Tracking ─────────────────────────────────────────────────────────────
export const joinRideTracking = (rideId) => {
  socket?.emit('join_ride_tracking', { rideId });
};

// ── Driver ───────────────────────────────────────────────────────────────
export const emitDriverLocation = (rideId, lat, lng, speed = 0) => {
  socket?.emit('driver_location', { rideId, lat, lng, speed });
};

export const setDriverOnline = (isOnline) => {
  socket?.emit('driver_online', { isOnline });
};
