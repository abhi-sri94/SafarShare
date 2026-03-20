const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

const handleCastError = (err) => new AppError(`Invalid ${err.path}: ${err.value}`, 400);
const handleDuplicateKeyError = (err) => {
  const field = Object.keys(err.keyValue)[0];
  const value = err.keyValue[field];
  return new AppError(`${field === 'phone' ? 'Phone number' : field === 'email' ? 'Email' : field} '${value}' is already registered.`, 409);
};
const handleValidationError = (err) => {
  const messages = Object.values(err.errors).map(e => e.message);
  return new AppError(messages.join('. '), 400);
};

const errorHandler = (err, req, res, next) => {
  let error = { ...err, message: err.message };

  // Mongoose errors
  if (err.name === 'CastError') error = handleCastError(err);
  if (err.code === 11000) error = handleDuplicateKeyError(err);
  if (err.name === 'ValidationError') error = handleValidationError(err);
  if (err.name === 'JsonWebTokenError') error = new AppError('Invalid token. Please log in again.', 401);
  if (err.name === 'TokenExpiredError') error = new AppError('Your session has expired. Please log in again.', 401);

  const statusCode = error.statusCode || 500;
  const status = error.status || 'error';

  // Log non-operational errors
  if (!error.isOperational) {
    logger.error('UNHANDLED ERROR:', err);
  }

  if (process.env.NODE_ENV === 'development') {
    res.status(statusCode).json({
      success: false,
      status,
      message: error.message,
      stack: err.stack,
      error: err,
    });
  } else {
    res.status(statusCode).json({
      success: false,
      status,
      message: error.isOperational ? error.message : 'Something went wrong. Please try again.',
    });
  }
};

module.exports = errorHandler;
