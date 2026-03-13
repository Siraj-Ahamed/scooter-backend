const http = require('http');
const app = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const connectDB = require('./config/database');
const { connectRedis } = require('./config/redis');
const { initSocket } = require('./socket/socketServer');
const { connectMQTT } = require('./mqtt/mqttClient');
const { startOfflineMonitor } = require('./services/offlineMonitor');
const { resetStaleOnlineVehicles } = require('./jobs/onStartup');

process.on('unhandledRejection', (reason) => logger.error('🔴 Unhandled Promise Rejection:', reason));
process.on('uncaughtException', (err) => { logger.error('🔴 Uncaught Exception:', err); process.exit(1); });

const startServer = async () => {
  try {
    await connectDB();
    await connectRedis();
    await resetStaleOnlineVehicles(); // mark any stale-online vehicles as offline

    const httpServer = http.createServer(app);
    initSocket(httpServer);
    connectMQTT();
    startOfflineMonitor();

    httpServer.listen(config.port, () => {
      logger.info(`
╔════════════════════════════════════════════╗
║     🛵  Scooter Rental Backend Server      ║
╠════════════════════════════════════════════╣
║  Status:      Running                      ║
║  Port:        ${String(config.port).padEnd(28)}║
║  Environment: ${config.env.padEnd(28)}║
║  API:         http://localhost:${config.port}/api/v1  ║
╚════════════════════════════════════════════╝
      `);
    });

    const shutdown = (signal) => {
      logger.info(`\n📴 ${signal} — shutting down gracefully...`);
      httpServer.close(async () => {
        const mongoose = require('mongoose');
        await mongoose.connection.close();
        logger.info('✅ Shutdown complete');
        process.exit(0);
      });
      setTimeout(() => { logger.error('⚠️  Forced shutdown'); process.exit(1); }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error(`❌ Server startup failed: ${error.message}`);
    process.exit(1);
  }
};

startServer();
