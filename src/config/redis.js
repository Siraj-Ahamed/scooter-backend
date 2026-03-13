const { createClient } = require('redis');
const config = require('./index');
const logger = require('../utils/logger');

let redisClient = null;

const connectRedis = async () => {
  try {
    redisClient = createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port,
        // Stop retrying after 3 attempts — Redis is optional
        reconnectStrategy: (retries) => {
          if (retries >= 3) return false; // stop retrying, return false = give up
          return Math.min(retries * 500, 2000);
        },
      },
      ...(config.redis.password && { password: config.redis.password }),
    });

    redisClient.on('error', (err) => {
      // Only log the first error, not every retry spam
      if (redisClient.isReady === false) return;
      logger.error(`❌ Redis error: ${err.message}`);
    });

    redisClient.on('connect', () => logger.info('✅ Redis connected'));
    redisClient.on('reconnecting', () => logger.warn('⚠️  Redis reconnecting...'));

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    logger.warn('⚠️  Redis not available — running without cache (this is fine for development)');
    redisClient = null;
    return null;
  }
};

const getRedisClient = () => redisClient;

module.exports = { connectRedis, getRedisClient };
