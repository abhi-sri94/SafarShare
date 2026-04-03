const express = require('express');
const supabase = require('../config/supabase');
const { protect, restrictTo } = require('../middleware/auth');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const router = express.Router();

// ── PATCH /api/admin/approve-driver/:id ───────────────────────────────────
router.patch('/approve-driver/:id', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const { data: user } = await supabase.from('users').select('*').eq('id', req.params.id).single();
    if (!user) return next(new AppError('User not found.', 404));

    if (!user.driver_info?.license_doc) {
      return next(new AppError('Driver documents missing.', 400));
    }

    const { data: updatedUser, error } = await supabase
      .from('users')
      .update({
        is_driver_approved: true,
        role: user.role === 'passenger' ? 'both' : user.role
      })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;

    res.json({
      success: true,
      message: 'Driver approved.',
      data: { user: updatedUser }
    });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/admin/dashboard-stats ──────────────────────────────────────────
router.get('/dashboard-stats', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const { count: totalUsers } = await supabase.from('users').select('*', { count: 'exact', head: true });
    const { count: activeDrivers } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .in('role', ['driver', 'both'])
      .eq('is_driver_approved', true);
    
    const { data: completedRides } = await supabase.from('rides').select('amount').eq('status', 'completed');
    const totalRevenue = completedRides?.reduce((sum, r) => sum + r.amount, 0) || 0;

    res.json({
      success: true,
      data: {
        totalUsers,
        activeDrivers,
        totalRevenue,
        totalOrders: totalUsers, // Mapping logic from before
        activeDeliveries: 0
      }
    });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/admin/users ────────────────────────────────────────────────────
router.get('/users', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const { data: users, error } = await supabase.from('users').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, count: users.length, data: users });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/admin/pending-drivers ──────────────────────────────────────────
router.get('/pending-drivers', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const { data: pending, error } = await supabase
      .from('users')
      .select('*')
      .eq('is_driver_approved', false)
      .not('driver_info->license_doc', 'is', null)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json({ success: true, count: pending.length, data: pending });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/admin/rides ────────────────────────────────────────────────────
router.get('/rides', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const { data: rides, error } = await supabase
      .from('rides')
      .select('*, driver:users(*)')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw error;
    res.json({ success: true, count: rides.length, data: rides });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
