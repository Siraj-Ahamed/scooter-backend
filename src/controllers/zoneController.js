const Zone    = require('../models/Zone');
const Vehicle = require('../models/Vehicle');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const logger = require('../utils/logger');

// ── List all predefined zones for the logged-in user ─────────────────────────
const getZones = async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const result = await Zone.paginate(
      { owner: req.user._id },
      { page: parseInt(page), limit: parseInt(limit), sort: { createdAt: -1 } }
    );
    return sendSuccess(res, {
      data: result.docs,
      pagination: { total: result.totalDocs, page: result.page, pages: result.totalPages, limit: result.limit },
    });
  } catch (err) { next(err); }
};

// ── Create a new predefined zone ─────────────────────────────────────────────
const createZone = async (req, res, next) => {
  try {
    const { name, description, color, polygon, ringMeta } = req.body;
    if (!polygon?.coordinates?.length) {
      return sendError(res, { statusCode: 400, message: 'polygon.coordinates is required' });
    }
    const zone = await Zone.create({
      owner: req.user._id,
      name,
      description: description || '',
      color: color || '#00e5ff',
      polygon,
      ringMeta: Array.isArray(ringMeta) ? ringMeta : [],
    });
    logger.info(`📍 Predefined zone created: ${name}`);
    return sendSuccess(res, { statusCode: 201, message: 'Zone created', data: zone });
  } catch (err) { next(err); }
};

// ── Get a single zone ─────────────────────────────────────────────────────────
const getZone = async (req, res, next) => {
  try {
    const zone = await Zone.findOne({ _id: req.params.id, owner: req.user._id });
    if (!zone) return sendError(res, { statusCode: 404, message: 'Zone not found.' });
    return sendSuccess(res, { data: zone });
  } catch (err) { next(err); }
};

// ── Update a predefined zone ──────────────────────────────────────────────────
const updateZone = async (req, res, next) => {
  try {
    const { name, description, color, polygon, ringMeta } = req.body;
    const updates = {};
    if (name        !== undefined) updates.name        = name;
    if (description !== undefined) updates.description = description;
    if (color       !== undefined) updates.color       = color;
    if (polygon     !== undefined) updates.polygon     = polygon;
    if (ringMeta    !== undefined) updates.ringMeta    = ringMeta;

    const zone = await Zone.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!zone) return sendError(res, { statusCode: 404, message: 'Zone not found.' });

    logger.info(`📍 Predefined zone updated: ${zone.name}`);
    return sendSuccess(res, { message: 'Zone updated', data: zone });
  } catch (err) { next(err); }
};

// ── Delete a predefined zone ──────────────────────────────────────────────────
const deleteZone = async (req, res, next) => {
  try {
    const zone = await Zone.findOne({ _id: req.params.id, owner: req.user._id });
    if (!zone) return sendError(res, { statusCode: 404, message: 'Zone not found.' });

    // Un-assign from any vehicles that reference this zone
    await Vehicle.updateMany(
      { assignedZones: zone._id },
      { $pull: { assignedZones: zone._id }, $set: { 'geofence.isEnabled': false } }
    );
    await Vehicle.updateMany(
      { assignedZone: zone._id },
      { $set: { assignedZone: null, 'geofence.isEnabled': false } }
    );

    await zone.deleteOne();
    logger.info(`📍 Predefined zone deleted: ${zone.name}`);
    return sendSuccess(res, { message: 'Zone deleted' });
  } catch (err) { next(err); }
};

// ── Assign / un-assign a predefined zone to a vehicle ────────────────────────
// PATCH /api/v1/zones/:id/assign  { vehicleId, assign: true|false }
const assignZoneToVehicle = async (req, res, next) => {
  try {
    const { vehicleId, assign } = req.body;
    if (!vehicleId) return sendError(res, { statusCode: 400, message: 'vehicleId is required' });

    const zone    = await Zone.findOne({ _id: req.params.id, owner: req.user._id });
    if (!zone)    return sendError(res, { statusCode: 404, message: 'Zone not found.' });

    const vehicle = await Vehicle.findOne({ _id: vehicleId, owner: req.user._id });
    if (!vehicle) return sendError(res, { statusCode: 404, message: 'Vehicle not found.' });

    const assigned = Array.isArray(vehicle.assignedZones) && vehicle.assignedZones.length
      ? vehicle.assignedZones.map((z) => z.toString())
      : (vehicle.assignedZone ? [vehicle.assignedZone.toString()] : []);
    const zoneId = zone._id.toString();
    const hasZone = assigned.includes(zoneId);

    if (assign && !hasZone) {
      assigned.push(zoneId);
      await Zone.updateOne({ _id: zone._id }, { $inc: { assignedCount: 1 } });
    } else if (!assign && hasZone) {
      const nextAssigned = assigned.filter((id) => id !== zoneId);
      assigned.length = 0;
      assigned.push(...nextAssigned);
      await Zone.updateOne({ _id: zone._id }, { $inc: { assignedCount: -1 } });
    }

    vehicle.assignedZones = assigned;
    vehicle.assignedZone = assigned[0] || null;

    await vehicle.save();
    return sendSuccess(res, { message: assign ? 'Zone assigned to vehicle' : 'Zone removed from vehicle', data: vehicle });
  } catch (err) { next(err); }
};

module.exports = { getZones, createZone, getZone, updateZone, deleteZone, assignZoneToVehicle };
