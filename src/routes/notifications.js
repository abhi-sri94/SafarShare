// ── notifications.js ─────────────────────────────────────────────────────
const express = require('express');
const supabase = require('../config/supabase');
const { protect } = require('../middleware/auth');

const router = express.Router();

// PATCH /api/notifications/fcm-token — update device token
router.patch('/fcm-token', protect, async (req, res, next) => {
  try {
    const { fcmToken } = req.body;
    if (!fcmToken) return res.status(400).json({ success: false, message: 'FCM token required' });
    
    await supabase.from('users').update({ fcm_token: fcmToken }).eq('id', req.user.id);
    
    res.json({ success: true, message: 'Device token updated.' });
  } catch (error) {
    next(error);
  }
});

// POST /api/notifications/test — send test push (dev only)
router.post('/test', protect, async (req, res, next) => {
  try {
    if (process.env.NODE_ENV === 'production') return res.status(403).json({ success: false });
    const { sendPush } = require('../services/firebaseService');
    
    // Fetch fresh user data for FCM token
    const { data: user } = await supabase.from('users').select('fcm_token').eq('id', req.user.id).single();
    
    if (user?.fcm_token) {
      await sendPush(user.fcm_token, '🚗 Test Notification', 'SafarShare notifications are working!');
    }
    
    res.json({ success: true, message: 'Test notification sent.' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
