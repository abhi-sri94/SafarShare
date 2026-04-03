const express = require('express');
const supabase = require('../config/supabase');
const { protect } = require('../middleware/auth');
const AppError = require('../utils/AppError');

const router = express.Router();

// ── GET /api/chat/:bookingId/messages ─────────────────────────────────────
router.get('/:bookingId/messages', protect, async (req, res, next) => {
  try {
    const { data: booking } = await supabase.from('bookings').select('*').eq('id', req.params.bookingId).single();
    if (!booking) return next(new AppError('Booking not found.', 404));

    const isParty = [booking.passenger_id, booking.driver_id].includes(req.user.id);
    if (!isParty) return next(new AppError('Not authorized.', 403));

    const { page = 1, limit = 50 } = req.query;
    const { data: messages, error } = await supabase
      .from('messages')
      .select('*, sender:users(*)')
      .eq('booking_id', req.params.bookingId)
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (error) throw error;

    // Mark as read
    await supabase
      .from('messages')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('booking_id', req.params.bookingId)
      .eq('receiver_id', req.user.id)
      .eq('is_read', false);

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
    const { count, error } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('receiver_id', req.user.id)
      .eq('is_read', false);

    if (error) throw error;
    res.json({ success: true, data: { unreadCount: count } });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/chat/conversations ────────────────────────────────────────────
router.get('/conversations/list', protect, async (req, res, next) => {
  try {
    // Get bookings where user is involved
    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('*, ride:rides(*), passenger:users(*), driver:users(*)')
      .or(`passenger_id.eq.${req.user.id},driver_id.eq.${req.user.id}`)
      .in('status', ['confirmed', 'in_progress', 'completed'])
      .order('updated_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    const conversations = await Promise.all(bookings.map(async (b) => {
      const { data: lastMsg } = await supabase
        .from('messages')
        .select('text, type, created_at, sender_id')
        .eq('booking_id', b.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      const { count: unread } = await supabase
        .from('messages')
        .select('*', { count: 'exact', head: true })
        .eq('booking_id', b.id)
        .eq('receiver_id', req.user.id)
        .eq('is_read', false);

      const other = b.passenger_id === req.user.id ? b.driver : b.passenger;
      return { booking: b, other, lastMessage: lastMsg, unreadCount: unread || 0 };
    }));

    res.json({ success: true, data: { conversations } });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
