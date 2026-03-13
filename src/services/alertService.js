const Alert = require('../models/Alert');
const { getIO } = require('../socket/socketServer');
const logger = require('../utils/logger');

const createAlert = async ({ scooterId, ownerId, tripId, type, severity, title, message, coordinates }) => {
  try {
    const alert = await Alert.create({
      owner: ownerId,
      scooter: scooterId,
      ...(tripId && { trip: tripId }),
      type,
      severity,
      title,
      message,
      ...(coordinates && { location: { coordinates } }),
    });

    logger.info(`🔔 Alert created: [${severity}] ${title}`);

    const io = getIO();
    if (io) {
      io.to(`owner:${ownerId.toString()}`).emit('alert:new', {
        id: alert._id,
        type,
        severity,
        title,
        message,
        scooterId,
        timestamp: alert.createdAt,
      });
    }

    return alert;
  } catch (error) {
    logger.error(`❌ Failed to create alert: ${error.message}`);
    throw error;
  }
};

const markAsRead = async (ownerId, alertId = null) => {
  const filter = alertId ? { _id: alertId, owner: ownerId } : { owner: ownerId, isRead: false };
  await Alert.updateMany(filter, { $set: { isRead: true, readAt: new Date() } });
};

module.exports = { createAlert, markAsRead };
