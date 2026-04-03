const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const handlePostgresError = (err) => {
  // Unique violation
  if (err.code === '23505') {
    const detail = err.detail || '';
    const fieldMatch = detail.match(/\((.*?)\)=\((.*?)\)/);
    const field = fieldMatch ? fieldMatch[1] : 'field';
    return new AppError(`${field === 'phone' ? 'Phone number' : field === 'email' ? 'Email' : field} already exists.`, 409);
  }

  // Foreign key violation
  if (err.code === '23503') {
    return new AppError('Related record not found.', 400);
  }

  // Not null violation
  if (err.code === '23502') {
    return new AppError(`Missing required field: ${err.column}`, 400);
  }

  return new AppError('Database error occurred.', 500);
};

const errorHandler = (err, req, res, next) => {
  let error = { ...err, message: err.message };

  // Supabase/PostgreSQL specific errors
  if (err.code && typeof err.code === 'string' && err.code.length === 5) {
    error = handlePostgresError(err);
  }

  if (err.name === 'JsonWebTokenError') error = new AppError('Invalid token.', 401);
  if (err.name === 'TokenExpiredError') error = new AppError('Session expired.', 401);

  const statusCode = error.statusCode || 500;
  
  if (process.env.NODE_ENV === 'development') {
    res.status(statusCode).json({
      success: false,
      message: error.message,
      stack: err.stack,
      error: err,
    });
  } else {
    res.status(statusCode).json({
      success: false,
      message: error.isOperational ? error.message : 'Something went wrong.',
    });
  }

  if (statusCode === 500) logger.error('UNHANDLED ERROR:', err);
};

module.exports = errorHandler;
