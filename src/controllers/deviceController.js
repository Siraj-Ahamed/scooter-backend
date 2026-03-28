const Device  = require('../models/Device');
const Vehicle = require('../models/Vehicle');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const { audit } = require('../services/auditService');
const logger = require('../utils/logger');

// ── GET /devices ───────────────────────────────────────────────────────────────
const getDevices = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, status, deviceType, assigned } = req.query;
    const filter = { owner: req.user._id };
    if (status)     filter.status     = status;
    if (deviceType) filter.deviceType = deviceType;
    if (assigned === 'true')  filter.assignedVehicle = { $ne: null };
    if (assigned === 'false') filter.assignedVehicle = null;

    const result = await Device.paginate(filter, {
      page:  parseInt(page),
      limit: parseInt(limit),
      sort:  { createdAt: -1 },
      populate: { path: 'assignedVehicle', select: 'name vehicleType status deviceId' },
    });

    return sendSuccess(res, {
      data: result.docs,
      pagination: { total: result.totalDocs, page: result.page, pages: result.totalPages, limit: result.limit },
    });
  } catch (err) { next(err); }
};

// ── POST /devices ──────────────────────────────────────────────────────────────
const createDevice = async (req, res, next) => {
  try {
    const { serialNumber, name, deviceType, manufacturer, model, firmwareVersion, simNumber, simCarrier, notes } = req.body;

    const device = await Device.create({
      serialNumber, name, deviceType, manufacturer, model,
      firmwareVersion, simNumber, simCarrier, notes,
      owner: req.user._id,
    });

    logger.info(`📡 Device registered: ${serialNumber}`);
    await audit(req, {
      action:       'device.create',
      description:  `Registered device "${name}" (${serialNumber})`,
      resourceType: 'device',
      resourceId:   device._id,
      resourceName: name,
    });

    return sendSuccess(res, { statusCode: 201, message: 'Device registered', data: device });
  } catch (err) { next(err); }
};

// ── GET /devices/:id ───────────────────────────────────────────────────────────
const getDevice = async (req, res, next) => {
  try {
    const device = await Device.findOne({ _id: req.params.id, owner: req.user._id })
      .populate('assignedVehicle', 'name vehicleType status deviceId plateNumber isOnline');
    if (!device) return sendError(res, { statusCode: 404, message: 'Device not found.' });
    return sendSuccess(res, { data: device });
  } catch (err) { next(err); }
};

// ── PATCH /devices/:id ─────────────────────────────────────────────────────────
const updateDevice = async (req, res, next) => {
  try {
    const allowed = ['name', 'deviceType', 'manufacturer', 'model', 'firmwareVersion', 'simNumber', 'simCarrier', 'status', 'notes'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    const device = await Device.findOneAndUpdate(
      { _id: req.params.id, owner: req.user._id },
      { $set: updates },
      { new: true, runValidators: true }
    ).populate('assignedVehicle', 'name vehicleType status deviceId');

    if (!device) return sendError(res, { statusCode: 404, message: 'Device not found.' });

    await audit(req, {
      action:       'device.update',
      description:  `Updated device "${device.name}" (${device.serialNumber})`,
      resourceType: 'device',
      resourceId:   device._id,
      resourceName: device.name,
      meta:         updates,
    });

    return sendSuccess(res, { message: 'Device updated', data: device });
  } catch (err) { next(err); }
};

// ── DELETE /devices/:id ────────────────────────────────────────────────────────
const deleteDevice = async (req, res, next) => {
  try {
    const device = await Device.findOne({ _id: req.params.id, owner: req.user._id });
    if (!device) return sendError(res, { statusCode: 404, message: 'Device not found.' });

    if (device.assignedVehicle) {
      return sendError(res, { statusCode: 400, message: 'Cannot delete a device that is assigned to a vehicle. Unassign it first.' });
    }

    await audit(req, {
      action:       'device.delete',
      description:  `Deleted device "${device.name}" (${device.serialNumber})`,
      resourceType: 'device',
      resourceId:   device._id,
      resourceName: device.name,
    });

    await device.deleteOne();
    return sendSuccess(res, { message: 'Device removed' });
  } catch (err) { next(err); }
};

// ── POST /devices/:id/assign ───────────────────────────────────────────────────
// Body: { vehicleId }  — pass null to unassign
const assignDevice = async (req, res, next) => {
  try {
    const { vehicleId } = req.body;

    const device = await Device.findOne({ _id: req.params.id, owner: req.user._id });
    if (!device) return sendError(res, { statusCode: 404, message: 'Device not found.' });

    // ── Unassign ──────────────────────────────────────────────────────────────
    if (!vehicleId) {
      const previousVehicleId = device.assignedVehicle;

      // Remove deviceId from the previously-assigned vehicle
      if (previousVehicleId) {
        await Vehicle.updateOne(
          { _id: previousVehicleId, owner: req.user._id },
          { $set: { deviceId: `UNASSIGNED-${previousVehicleId}` } }
        );
      }

      device.assignedVehicle = null;
      device.assignedAt      = null;
      device.status          = 'inactive';
      await device.save();

      logger.info(`📡 Device ${device.serialNumber} unassigned`);
      await audit(req, {
        action:       'device.assign',
        description:  `Unassigned device "${device.name}" (${device.serialNumber})`,
        resourceType: 'device',
        resourceId:   device._id,
        resourceName: device.name,
        meta:         { vehicleId: null },
      });

      return sendSuccess(res, { message: 'Device unassigned', data: device });
    }

    // ── Assign ────────────────────────────────────────────────────────────────
    const vehicle = await Vehicle.findOne({ _id: vehicleId, owner: req.user._id });
    if (!vehicle) return sendError(res, { statusCode: 404, message: 'Vehicle not found.' });

    // Check if another device is already mapped to this vehicle's deviceId slot
    const conflict = await Device.findOne({
      assignedVehicle: vehicle._id,
      _id: { $ne: device._id },
      owner: req.user._id,
    });
    if (conflict) {
      return sendError(res, {
        statusCode: 400,
        message: `Vehicle already has device "${conflict.name}" (${conflict.serialNumber}) assigned. Unassign it first.`,
      });
    }

    // If this device was previously assigned elsewhere, clean that up
    if (device.assignedVehicle && device.assignedVehicle.toString() !== vehicleId) {
      await Vehicle.updateOne(
        { _id: device.assignedVehicle, owner: req.user._id },
        { $set: { deviceId: `UNASSIGNED-${device.assignedVehicle}` } }
      );
    }

    // Sync the vehicle's deviceId field with the device's serialNumber
    await Vehicle.updateOne(
      { _id: vehicle._id },
      { $set: { deviceId: device.serialNumber } }
    );

    device.assignedVehicle = vehicle._id;
    device.assignedAt      = new Date();
    device.status          = 'active';
    await device.save();

    logger.info(`📡 Device ${device.serialNumber} assigned to vehicle ${vehicle.name}`);
    await audit(req, {
      action:       'device.assign',
      description:  `Assigned device "${device.name}" (${device.serialNumber}) to vehicle "${vehicle.name}"`,
      resourceType: 'device',
      resourceId:   device._id,
      resourceName: device.name,
      meta:         { vehicleId: vehicle._id, vehicleName: vehicle.name },
    });

    const populated = await Device.findById(device._id)
      .populate('assignedVehicle', 'name vehicleType status deviceId plateNumber');

    return sendSuccess(res, { message: 'Device assigned to vehicle', data: populated });
  } catch (err) { next(err); }
};

module.exports = { getDevices, createDevice, getDevice, updateDevice, deleteDevice, assignDevice };
