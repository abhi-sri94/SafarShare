const express = require('express');
const User = require('../models/User');
const { protect, restrictTo } = require('../middleware/auth');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const router = express.Router();

// ── PATCH /api/admin/approve-driver/:id ───────────────────────────────────
router.patch('/approve-driver/:id', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return next(new AppError('User not found.', 404));

    // Ensure they have basic driver info before approval
    if (!user.driverInfo || !user.driverInfo.licenseDoc) {
      return next(new AppError('Driver documents missing. Cannot approve.', 400));
    }

    user.isDriverApproved = true;
    user.role = user.role === 'passenger' ? 'both' : user.role; // Upgrade role if needed
    await user.save();

    logger.info(`Driver ${user._id} approved by admin ${req.user._id}`);

    res.json({
      success: true,
      message: 'Driver approved successfully.',
      data: { user: { id: user._id, isDriverApproved: user.isDriverApproved, role: user.role } }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
