const Vehicle = require('../../models/Vehicle');
const { getIO } = require('../../socket/socketServer');
const alertService = require('../../services/alertService');
const logger = require('../../utils/logger');

const handleStatus = async (deviceId, payload) => {
  const { event } = payload;
  if (!event) return;

  const vehicle = await Vehicle.findOne({ deviceId });
  if (!vehicle) { logger.warn(`⚠️  Status from unknown deviceId: ${deviceId}`); return; }

  const io = getIO();
  let updateFields = {};

  switch (event) {
    case 'connected':
      logger.info(`🟢 Vehicle online: ${deviceId}`);
      updateFields = { isOnline: true };
      break;
    case 'disconnected':
      logger.warn(`🔴 Vehicle offline: ${deviceId}`);
      updateFields = { isOnline: false, status: 'offline' };
      if (vehicle.currentTrip) {
        await alertService.createAlert({
          scooterId: vehicle._id, ownerId: vehicle.owner, tripId: vehicle.currentTrip,
          type: 'offline', severity: 'critical',
          title: `⚠️ Vehicle Offline: ${vehicle.name}`,
          message: `${vehicle.name} has gone offline during an active trip.`,
        });
      }
      break;
    case 'engine_on':
      updateFields = { isEngineOn: true };
      break;
    case 'engine_off':
      updateFields = { isEngineOn: false };
      break;
    case 'engine_locked':
      updateFields = { isEngineOn: false, status: 'locked' };
      break;
    case 'sos':
      logger.warn(`🆘 SOS from ${deviceId}!`);
      await alertService.createAlert({
        scooterId: vehicle._id, ownerId: vehicle.owner, tripId: vehicle.currentTrip,
        type: 'sos', severity: 'critical',
        title: `🆘 SOS Alert: ${vehicle.name}`,
        message: `The operator of ${vehicle.name} has pressed the SOS button.`,
      });
      break;
    default:
      logger.warn(`⚠️  Unknown status event: ${event}`);
  }

  if (Object.keys(updateFields).length > 0) {
    await Vehicle.updateOne({ _id: vehicle._id }, { $set: updateFields });
  }

  if (io) {
    io.to(`owner:${vehicle.owner.toString()}`).emit('scooter:status', {
      scooterId: vehicle._id, deviceId, event, ...updateFields, timestamp: new Date(),
    });
  }
};

module.exports = { handleStatus };
