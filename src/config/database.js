const logger = require('../utils/logger');
const supabase = require('./supabase');

// Kept for compatibility with existing server bootstrap.
// The project now uses Supabase (no MongoDB connection required).
module.exports = function connectDB() {
  if (!supabase) {
    logger.warn('Supabase client is not configured. Check SUPABASE_URL and SUPABASE_ANON_KEY.');
    return;
  }
  logger.info('Supabase client initialized');
};
