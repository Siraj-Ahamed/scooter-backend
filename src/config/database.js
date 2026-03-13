const mongoose = require('mongoose');
const config = require('./index');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.mongo.uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    logger.info(`✅ MongoDB Connected: ${conn.connection.host}`);

    mongoose.connection.on('error', (err) => logger.error(`❌ MongoDB error: ${err.message}`));
    mongoose.connection.on('disconnected', () => logger.warn('⚠️  MongoDB disconnected'));
    mongoose.connection.on('reconnected', () => logger.info('✅ MongoDB reconnected'));
  } catch (error) {
    logger.error(`❌ MongoDB connection failed: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
