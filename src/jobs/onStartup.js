const Vehicle = require('../models/Vehicle');
const logger = require('../utils/logger');

const resetStaleOnlineVehicles = async () => {
  try {
    const result = await Vehicle.updateMany(
      { isOnline: true },
      { $set: { isOnline: false, status: 'offline' } }
    );
    if (result.modifiedCount > 0) {
      logger.info(`🔄 Reset ${result.modifiedCount} stale-online vehicle(s) to offline on startup`);
    }
  } catch (err) {
    logger.error(`❌ Failed to reset stale online vehicles: ${err.message}`);
  }
};

module.exports = { resetStaleOnlineVehicles };
