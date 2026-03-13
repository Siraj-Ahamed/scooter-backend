const Scooter = require('../models/Vehicle'); // redirected to Vehicle model
const { getRedisClient } = require('../config/redis');
const { publishCommand } = require('../mqtt/mqttClient');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const logger = require('../utils/logger');

const getScooters = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const filter = { owner: req.user._id, ...(status && { status }) };
    const result = await Scooter.paginate(filter, { page: parseInt(page), limit: parseInt(limit), sort: { createdAt: -1 } });
    return sendSuccess(res, {
      data: result.docs,
      pagination: { total: result.totalDocs, page: result.page, pages: result.totalPages, limit: result.limit },
    });
  } catch (error) { next(error); }
};

const createScooter = async (req, res, next) => {
  try {
    const { name, deviceId, plateNumber, model, color, year } = req.body;
    const scooter = await Scooter.create({ name, deviceId, plateNumber, model, color, year, owner: req.user._id });
    logger.info(`🛵 Scooter created: ${deviceId}`);
    return sendSuccess(res, { statusCode: 201, message: 'Scooter registered successfully', data: scooter });
  } catch (error) { next(error); }
};

const getScooter = async (req, res, next) => {
  try {
    const scooter = await Scooter.findOne({ _id: req.params.id, owner: req.user._id }).populate('currentTrip', 'rider startedAt status');
    if (!scooter) return sendError(res, { statusCode: 404, message: 'Scooter not found.' });
    return sendSuccess(res, { data: scooter });
  } catch (error) { next(error); }
};

const updateScooter = async (req, res, next) => {
  try {
    const allowedUpdates = ['name', 'plateNumber', 'model', 'color', 'year'];
    const updates = {};
    allowedUpdates.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    const scooter = await Scooter.findOneAndUpdate({ _id: req.params.id, owner: req.user._id }, { $set: updates }, { new: true, runValidators: true });
    if (!scooter) return sendError(res, { statusCode: 404, message: 'Scooter not found.' });
    return sendSuccess(res, { message: 'Scooter updated', data: scooter });
  } catch (error) { next(error); }
};

const deleteScooter = async (req, res, next) => {
  try {
    const scooter = await Scooter.findOne({ _id: req.params.id, owner: req.user._id });
    if (!scooter) return sendError(res, { statusCode: 404, message: 'Scooter not found.' });
    if (scooter.status === 'rented') return sendError(res, { statusCode: 400, message: 'Cannot delete a scooter that is currently rented.' });
    await scooter.deleteOne();
    return sendSuccess(res, { message: 'Scooter removed successfully' });
  } catch (error) { next(error); }
};

const getScooterLocation = async (req, res, next) => {
  try {
    const scooter = await Scooter.findOne({ _id: req.params.id, owner: req.user._id }).select('location lastTelemetry deviceId isOnline');
    if (!scooter) return sendError(res, { statusCode: 404, message: 'Scooter not found.' });

    const redis = getRedisClient();
    let locationData = null;
    if (redis) {
      const cached = await redis.get(`scooter:location:${scooter._id}`);
      if (cached) locationData = JSON.parse(cached);
    }
    if (!locationData) {
      locationData = {
        lat: scooter.location.coordinates[1],
        lng: scooter.location.coordinates[0],
        speed: scooter.lastTelemetry.speed,
        battery: scooter.lastTelemetry.battery,
        timestamp: scooter.lastTelemetry.timestamp,
      };
    }

    return sendSuccess(res, { data: { ...locationData, isOnline: scooter.isOnline, scooterId: scooter._id, deviceId: scooter.deviceId } });
  } catch (error) { next(error); }
};

const setGeofence = async (req, res, next) => {
  try {
    const { isEnabled, name, polygon, zoneMeta } = req.body;
    const scooter = await Scooter.findOne({ _id: req.params.id, owner: req.user._id });
    if (!scooter) return sendError(res, { statusCode: 404, message: 'Scooter not found.' });

    scooter.geofence = {
      isEnabled,
      name: name || '',
      polygon: polygon || scooter.geofence?.polygon,
      zoneMeta: Array.isArray(zoneMeta) ? zoneMeta : scooter.geofence?.zoneMeta,
    };
    await scooter.save();

    logger.info(`📍 Geofence ${isEnabled ? 'enabled' : 'disabled'} for ${scooter.deviceId}`);
    return sendSuccess(res, { message: `Geofence ${isEnabled ? 'enabled' : 'disabled'}`, data: scooter.geofence });
  } catch (error) { next(error); }
};

const sendScooterCommand = async (req, res, next) => {
  try {
    const { action, payload = {} } = req.body;
    const allowedActions = ['lock_engine', 'unlock_engine', 'get_location', 'honk'];
    if (!allowedActions.includes(action)) {
      return sendError(res, { statusCode: 400, message: `Invalid action. Allowed: ${allowedActions.join(', ')}` });
    }

    const scooter = await Scooter.findOne({ _id: req.params.id, owner: req.user._id }).select('deviceId status isOnline');
    if (!scooter) return sendError(res, { statusCode: 404, message: 'Scooter not found.' });
    if (!scooter.isOnline) return sendError(res, { statusCode: 400, message: 'Scooter is offline.' });

    const sent = publishCommand(scooter.deviceId, { action, ...payload });
    if (!sent) return sendError(res, { statusCode: 503, message: 'MQTT service unavailable.' });

    if (action === 'lock_engine') await Scooter.updateOne({ _id: scooter._id }, { $set: { status: 'locked', isEngineOn: false } });
    else if (action === 'unlock_engine') await Scooter.updateOne({ _id: scooter._id }, { $set: { status: 'available', isEngineOn: true } });

    return sendSuccess(res, { message: `Command '${action}' sent to scooter` });
  } catch (error) { next(error); }
};

module.exports = { getScooters, createScooter, getScooter, updateScooter, deleteScooter, getScooterLocation, setGeofence, sendScooterCommand };
