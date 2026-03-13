const Vehicle = require('../models/Vehicle');
const config = require('../config');
const { getIO } = require('../socket/socketServer');
const logger = require('../utils/logger');
const alertService = require('./alertService');

let offlineTimer = null;

const checkOfflineVehicles = async () => {
  const cutoff = new Date(Date.now() - config.telemetry.offlineTimeoutMs);
  const candidates = await Vehicle.find({
    isOnline: true,
    updatedAt: { $lt: cutoff },
  }).select('_id owner deviceId name currentTrip');

  for (const vehicle of candidates) {
    const result = await Vehicle.updateOne(
      { _id: vehicle._id, isOnline: true },
      { $set: { isOnline: false, status: 'offline' } }
    );
    if (result.modifiedCount === 0) continue;

    logger.warn(`Vehicle offline by timeout: ${vehicle.deviceId}`);

    if (vehicle.currentTrip) {
      await alertService.createAlert({
        scooterId: vehicle._id,
        ownerId: vehicle.owner,
        tripId: vehicle.currentTrip,
        type: 'offline',
        severity: 'critical',
        title: `Vehicle Offline: ${vehicle.name}`,
        message: `${vehicle.name} has gone offline during an active trip.`,
      });
    }

    const io = getIO();
    if (io) {
      io.to(`owner:${vehicle.owner.toString()}`).emit('scooter:status', {
        scooterId: vehicle._id,
        deviceId: vehicle.deviceId,
        event: 'timeout_offline',
        isOnline: false,
        status: 'offline',
        timestamp: new Date(),
      });
    }
  }
};

const startOfflineMonitor = () => {
  if (offlineTimer) return;
  offlineTimer = setInterval(() => {
    checkOfflineVehicles().catch((error) => {
      logger.error(`Offline monitor error: ${error.message}`);
    });
  }, config.telemetry.offlineCheckIntervalMs);
  if (typeof offlineTimer.unref === 'function') offlineTimer.unref();
  logger.info(`Offline monitor started (timeout=${config.telemetry.offlineTimeoutMs}ms, interval=${config.telemetry.offlineCheckIntervalMs}ms)`);
};

module.exports = { startOfflineMonitor, checkOfflineVehicles };
