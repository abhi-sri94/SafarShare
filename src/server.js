const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const hpp = require('hpp');
const path = require('path');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { initSocket } = require('./socket/socket');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');

// Routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const rideRoutes = require('./routes/rides');
const bookingRoutes = require('./routes/bookings');
const paymentRoutes = require('./routes/payments');
const chatRoutes = require('./routes/chat');
const trackingRoutes = require('./routes/tracking');
const adminRoutes = require('./routes/admin');
const statsRoutes = require('./routes/stats');
const notificationRoutes = require('./routes/notifications');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);

// Init Socket.io
initSocket(server);

// Security headers
app.use(helmet());

// CORS
const allowedOrigins = (() => {
  const envList = (process.env.FRONTEND_URL || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const defaults = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:5501',
    'http://127.0.0.1:5501',
    'http://localhost:5502',
    'http://127.0.0.1:5502',
    'https://safarshare-web.vercel.app',
    'https://app.safarshare.in',
  ];

  return Array.from(new Set([...envList, ...defaults]));
})();

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting — global
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', globalLimiter);

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many auth attempts, please try again in 15 minutes.' },
});

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security middleware
app.use(hpp());           // Prevent HTTP param pollution
app.use(compression());   // Gzip responses

// Logging
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));
}

// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'SafarShare API is running 🚗 (Supabase Enabled)',
    version: '1.0.0',
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// ── Serve Static Website ───────────────────────────────────────────────────
// Serve all files in the root folder (index.html, assets, etc.)
app.use(express.static(path.join(__dirname, '../')));

// Specific routes for the App and Admin (Matches our old Render logic)
app.get('/app/*', (req, res) => {
  res.sendFile(path.join(__dirname, '../apps/safarshare-app-connected.html'));
});

app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(__dirname, '../apps/admin-login.html'));
});

// Root route serves the landing page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../index.html'));
});

// API Routes
app.use('/api/stats', statsRoutes);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/rides', rideRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/tracking', trackingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);

// Razorpay webhook (raw body needed)
app.use('/webhook/razorpay', express.raw({ type: 'application/json' }));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// Global error handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(`SafarShare backend running on port ${PORT} in ${process.env.NODE_ENV} mode (Supabase Ready)`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed.');
    process.exit(0);
  });
});

module.exports = { app, server };
