const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AppError = require('../utils/AppError');

const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return next(new AppError('Not authenticated. Please log in.', 401));
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select('+password');
    if (!user) return next(new AppError('User no longer exists.', 401));
    if (user.isBanned) return next(new AppError('Your account has been suspended. Contact support.', 403));

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') return next(new AppError('Invalid token.', 401));
    if (error.name === 'TokenExpiredError') return next(new AppError('Token expired. Please log in again.', 401));
    next(error);
  }
};

const restrictTo = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return next(new AppError('You do not have permission to perform this action.', 403));
  }
  next();
};

const requireDriverApproval = (req, res, next) => {
  if (!req.user.isDriverApproved) {
    return next(new AppError('Your driver account is pending admin approval.', 403));
  }
  next();
};

const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id);
    }
    next();
  } catch {
    next(); // Continue without auth
  }
};

module.exports = { protect, restrictTo, requireDriverApproval, optionalAuth };
