const Vehicle = require('../models/Vehicle');
const { getRedisClient } = require('../config/redis');
const { publishCommand } = require('../mqtt/mqttClient');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const logger = require('../utils/logger');

const getVehicles = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, vehicleType } = req.query;
    const filter = {
      owner: req.user._id,
      ...(status && { status }),
      ...(vehicleType && { vehicleType }),
    };
    const result = await Vehicle.paginate(filter, {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
    });
    return sendSuccess(res, {
      data: result.docs,
      pagination: { total: result.totalDocs, page: result.page, pages: result.totalPages, limit: result.limit },
    });
  } catch (error) { next(error); }
};

const createVehicle = async (req, res, next) => {
  try {
    const { name, deviceId, vehicleType, plateNumber, model, color, year } = req.body;
    const vehicle = await Vehicle.create({ name, deviceId, vehicleType, plateNumber, model, color, year, owner: req.user._id });
    logger.info(`🚗 Vehicle created: ${deviceId} (${vehicleType})`);
    return sendSuccess(res, { statusCode: 201, message: 'Vehicle registered successfully', data: vehicle });
  } catch (error) { next(error); }
};

const getVehicle = async (req, res, next) => {
  try {
    const vehicle = await Vehicle.findOne({ _id: req.params.id, owner: req.user._id })
      .populate('currentTrip', 'rider startedAt status')
      .populate('assignedZones')
      .populate('assignedZone');
    if (!vehicle) return sendError(res, { statusCode: 404, message: 'Vehicle not found.' });
    return sendSuccess(res, { data: vehicle });
  } catch (error) { next(error); }
};

const updateVehicle = async (req, res, next) => {
  try {
    const allowedUpdates = ['name', 'vehicleType', 'plateNumber', 'model', 'color', 'year'];
    const updates = {};
    allowedUpdates.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    const vehicle = await Vehicle.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!vehicle) return sendError(res, { statusCode: 404, message: 'Vehicle not found.' });
    return sendSuccess(res, { message: 'Vehicle updated', data: vehicle });
  } catch (error) { next(error); }
};

const deleteVehicle = async (req, res, next) => {
  try {
    const vehicle = await Vehicle.findOne({ _id: req.params.id, owner: req.user._id });
    if (!vehicle) return sendError(res, { statusCode: 404, message: 'Vehicle not found.' });
    if (vehicle.status === 'rented') return sendError(res, { statusCode: 400, message: 'Cannot delete a vehicle that is currently rented.' });
    await vehicle.deleteOne();
    return sendSuccess(res, { message: 'Vehicle removed successfully' });
  } catch (error) { next(error); }
};

const getVehicleLocation = async (req, res, next) => {
  try {
    const vehicle = await Vehicle.findOne({ _id: req.params.id, owner: req.user._id })
      .select('location lastTelemetry deviceId isOnline');
    if (!vehicle) return sendError(res, { statusCode: 404, message: 'Vehicle not found.' });

    const redis = getRedisClient();
    let locationData = null;
    if (redis) {
      const cached = await redis.get(`scooter:location:${vehicle._id}`);
      if (cached) locationData = JSON.parse(cached);
    }
    if (!locationData) {
      locationData = {
        lat:       vehicle.location.coordinates[1],
        lng:       vehicle.location.coordinates[0],
        speed:     vehicle.lastTelemetry.speed,
        battery:   vehicle.lastTelemetry.battery,
        timestamp: vehicle.lastTelemetry.timestamp,
      };
    }

    return sendSuccess(res, {
      data: { ...locationData, isOnline: vehicle.isOnline, vehicleId: vehicle._id, deviceId: vehicle.deviceId },
    });
  } catch (error) { next(error); }
};

const setGeofence = async (req, res, next) => {
  try {
    const { isEnabled, name, polygon, zoneMeta, useCustomZone, useCustomExclusion, assignedZoneId, assignedZoneIds } = req.body;
    const vehicle = await Vehicle.findOne({ _id: req.params.id, owner: req.user._id });
    if (!vehicle) return sendError(res, { statusCode: 404, message: 'Vehicle not found.' });

    // Handle assigned zone references (supports legacy single id + new array)
    if (assignedZoneIds !== undefined || assignedZoneId !== undefined) {
      const Zone = require('../models/Zone');
      const prevAssigned = Array.isArray(vehicle.assignedZones) && vehicle.assignedZones.length
        ? vehicle.assignedZones.map((z) => z.toString())
        : (vehicle.assignedZone ? [vehicle.assignedZone.toString()] : []);

      let nextIds = [];
      if (assignedZoneIds !== undefined) {
        if (assignedZoneIds === null) nextIds = [];
        else if (!Array.isArray(assignedZoneIds)) {
          return sendError(res, { statusCode: 400, message: 'assignedZoneIds must be an array' });
        } else {
          nextIds = assignedZoneIds.filter(Boolean).map((id) => id.toString());
        }
      } else if (assignedZoneId !== undefined) {
        nextIds = assignedZoneId ? [assignedZoneId.toString()] : [];
      }

      const uniqueIds = Array.from(new Set(nextIds));
      if (uniqueIds.length) {
        const zones = await Zone.find({ _id: { $in: uniqueIds }, owner: req.user._id }).select('_id');
        if (zones.length !== uniqueIds.length) {
          return sendError(res, { statusCode: 404, message: 'Zone not found.' });
        }
        vehicle.assignedZones = zones.map((z) => z._id);
      } else {
        vehicle.assignedZones = [];
      }

      // Keep legacy field in sync with the first assigned zone
      vehicle.assignedZone = vehicle.assignedZones[0] || null;

      const prevSet = new Set(prevAssigned);
      const nextSet = new Set(uniqueIds);
      const toAdd = uniqueIds.filter((id) => !prevSet.has(id));
      const toRemove = prevAssigned.filter((id) => !nextSet.has(id));
      if (toAdd.length) await Zone.updateMany({ _id: { $in: toAdd } }, { $inc: { assignedCount: 1 } });
      if (toRemove.length) await Zone.updateMany({ _id: { $in: toRemove } }, { $inc: { assignedCount: -1 } });
    }

    vehicle.geofence = {
      isEnabled,
      name: name || '',
      useCustomZone:      useCustomZone      ?? vehicle.geofence?.useCustomZone      ?? false,
      useCustomExclusion: useCustomExclusion ?? vehicle.geofence?.useCustomExclusion ?? false,
      polygon: polygon || vehicle.geofence?.polygon,
      zoneMeta: Array.isArray(zoneMeta) ? zoneMeta : vehicle.geofence?.zoneMeta,
    };
    await vehicle.save();

    logger.info(`📍 Geofence ${isEnabled ? 'enabled' : 'disabled'} for ${vehicle.deviceId}`);
    return sendSuccess(res, { message: `Geofence ${isEnabled ? 'enabled' : 'disabled'}`, data: vehicle.geofence });
  } catch (error) { next(error); }
};

const sendVehicleCommand = async (req, res, next) => {
  try {
    const { action, payload = {} } = req.body;
    const allowedActions = ['lock_engine', 'unlock_engine', 'get_location', 'honk'];
    if (!allowedActions.includes(action)) {
      return sendError(res, { statusCode: 400, message: `Invalid action. Allowed: ${allowedActions.join(', ')}` });
    }

    const vehicle = await Vehicle.findOne({ _id: req.params.id, owner: req.user._id })
      .select('deviceId status isOnline');
    if (!vehicle) return sendError(res, { statusCode: 404, message: 'Vehicle not found.' });
    if (!vehicle.isOnline) return sendError(res, { statusCode: 400, message: 'Vehicle is offline.' });

    const sent = publishCommand(vehicle.deviceId, { action, ...payload });
    if (!sent) return sendError(res, { statusCode: 503, message: 'MQTT service unavailable.' });

    if (action === 'lock_engine')   await Vehicle.updateOne({ _id: vehicle._id }, { $set: { status: 'locked',    isEngineOn: false } });
    else if (action === 'unlock_engine') await Vehicle.updateOne({ _id: vehicle._id }, { $set: { status: 'available', isEngineOn: true  } });

    return sendSuccess(res, { message: `Command '${action}' sent to vehicle` });
  } catch (error) { next(error); }
};

module.exports = { getVehicles, createVehicle, getVehicle, updateVehicle, deleteVehicle, getVehicleLocation, setGeofence, sendVehicleCommand };
