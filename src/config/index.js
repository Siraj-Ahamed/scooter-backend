require('dotenv').config();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 5000,
  isDev: process.env.NODE_ENV === 'development',
  isProd: process.env.NODE_ENV === 'production',

  mongo: {
    uri: process.env.MONGO_URI,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expire: process.env.JWT_EXPIRE || '7d',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpire: process.env.JWT_REFRESH_EXPIRE || '30d',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },

  mqtt: {
    brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    clientId: process.env.MQTT_CLIENT_ID || 'scooter_backend',
    topics: {
      telemetry: process.env.MQTT_TOPIC_TELEMETRY || 'scooters/+/telemetry',
      status: process.env.MQTT_TOPIC_STATUS || 'scooters/+/status',
    },
  },

  telemetry: {
    offlineTimeoutMs: parseInt(process.env.TELEMETRY_OFFLINE_TIMEOUT_MS, 10) || 120000,
    offlineCheckIntervalMs: parseInt(process.env.TELEMETRY_OFFLINE_CHECK_INTERVAL_MS, 10) || 15000,
  },

  cors: {
    origins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(','),
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
  },
};

const required = ['MONGO_URI', 'JWT_SECRET', 'JWT_REFRESH_SECRET'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`\n❌ Missing required environment variables:\n  ${missing.join('\n  ')}\n`);
  process.exit(1);
}

module.exports = config;
