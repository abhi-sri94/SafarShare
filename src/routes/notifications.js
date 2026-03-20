// ── notifications.js ─────────────────────────────────────────────────────
const express = require('express');
const { protect } = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();

// PATCH /api/notifications/fcm-token — update device token
router.patch('/fcm-token', protect, async (req, res, next) => {
  try {
    const { fcmToken } = req.body;
    if (!fcmToken) return res.status(400).json({ success: false, message: 'FCM token required' });
    await User.findByIdAndUpdate(req.user._id, { fcmToken });
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
    await sendPush(req.user.fcmToken, '🚗 Test Notification', 'SafarShare notifications are working!');
    res.json({ success: true, message: 'Test notification sent.' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
