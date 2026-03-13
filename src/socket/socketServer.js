const socketIO = require('socket.io');
const { verifyAccessToken } = require('../utils/jwt');
const User = require('../models/User');
const logger = require('../utils/logger');
const config = require('../config');

let io = null;

const initSocket = (httpServer) => {
  io = socketIO(httpServer, {
    cors: { origin: config.cors.origins, methods: ['GET', 'POST'], credentials: true },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (!token) return next(new Error('Authentication error: No token provided'));
      const decoded = verifyAccessToken(token);
      const user = await User.findById(decoded.id);
      if (!user || !user.isActive) return next(new Error('Authentication error: Invalid user'));
      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user._id.toString();
    logger.info(`🔌 Socket connected: user ${userId}`);

    socket.join(`owner:${userId}`);

    socket.on('watch:scooter', (scooterId) => socket.join(`scooter:${scooterId}`));
    socket.on('unwatch:scooter', (scooterId) => socket.leave(`scooter:${scooterId}`));

    socket.on('disconnect', (reason) => logger.info(`🔌 Socket disconnected: user ${userId} — ${reason}`));
    socket.on('error', (err) => logger.error(`❌ Socket error for user ${userId}: ${err.message}`));
  });

  logger.info('✅ Socket.IO initialized');
  return io;
};

const getIO = () => io;

module.exports = { initSocket, getIO };
