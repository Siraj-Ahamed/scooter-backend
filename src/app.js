const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const compression = require('compression');

const config = require('./config');
const logger = require('./utils/logger');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth.routes');
const scooterRoutes = require('./routes/scooter.routes');
const vehicleRoutes = require('./routes/vehicle.routes');
const tripRoutes = require('./routes/trip.routes');
const alertRoutes = require('./routes/alert.routes');
const zoneRoutes       = require('./routes/zone.routes');
const analyticsRoutes  = require('./routes/analytics.routes');
const settingsRoutes   = require('./routes/settings.routes');

const app = express();

app.use(helmet());
app.use(cors({ origin: config.cors.origins, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] }));

const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.isDev ? 100000 : config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again later.' },
  skip: (req) => req.path.startsWith('/v1/auth/'),
});

const authLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.isDev ? 100000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many auth requests. Please try again later.' },
});
app.use('/api/', limiter);
app.use('/api/v1/auth', authLimiter);

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());

if (config.isDev) {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));
}

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', environment: config.env, timestamp: new Date().toISOString() });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/scooters', scooterRoutes); // legacy alias kept
app.use('/api/v1/vehicles', vehicleRoutes);
app.use('/api/v1/zones', zoneRoutes);
app.use('/api/v1/trips', tripRoutes);
app.use('/api/v1/alerts',    alertRoutes);
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/settings',  settingsRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
