const Vehicle = require('../../models/Vehicle');
const Device  = require('../../models/Device');
const { getRedisClient } = require('../../config/redis');
const { getIO } = require('../../socket/socketServer');
const { publishCommand } = require('../mqttClient');
const geofenceService = require('../../services/geofenceService');
const alertService = require('../../services/alertService');
const logger = require('../../utils/logger');

const toNumber = (value) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseGpsCoordinate = (value, direction, axis) => {
  const numeric = toNumber(value);
  if (numeric === null) return null;
  const degrees = Math.floor(numeric / 100);
  const minutes = numeric - (degrees * 100);
  let decimal = degrees + (minutes / 60);
  const dir = String(direction || '').toUpperCase();
  if ((axis === 'lat' && dir === 'S') || (axis === 'lng' && dir === 'W')) decimal *= -1;
  return decimal;
};

const normalizeTelemetryPayload = (rawPayload = {}) => {
  const location  = rawPayload.location  || {};
  const batteryObj = rawPayload.battery  || {};
  const signalObj  = rawPayload.signal   || {};

  const lat = location.latitude !== undefined
    ? parseGpsCoordinate(location.latitude, location.lat_dir, 'lat')
    : toNumber(rawPayload.lat);
  const lng = location.longitude !== undefined
    ? parseGpsCoordinate(location.longitude, location.lon_dir, 'lng')
    : toNumber(rawPayload.lng);

  const speedKnots   = toNumber(location.speed);
  const fallbackSpeed = toNumber(rawPayload.speed);
  const speed   = speedKnots !== null ? speedKnots * 1.852 : (fallbackSpeed ?? 0);
  const battery = toNumber(batteryObj.percentage) ?? toNumber(rawPayload.battery) ?? 0;
  const odometer = toNumber(rawPayload.odometer) ?? 0;

  let timestamp = new Date();
  if (rawPayload.timestamp !== undefined && rawPayload.timestamp !== null) {
    const tsNum = Number(rawPayload.timestamp);
    if (Number.isFinite(tsNum)) {
      timestamp = tsNum > 1e12 ? new Date(tsNum) : new Date(tsNum * 1000);
    }
  }

  return {
    serial: rawPayload.serial ? String(rawPayload.serial).trim().toUpperCase() : undefined,
    lat, lng, speed, battery, odometer,
    signal: { rssi: toNumber(signalObj.rssi), ber: toNumber(signalObj.ber) },
    lockStatus: rawPayload.lock_status
      ? String(rawPayload.lock_status).toUpperCase()
      : (rawPayload.lockStatus ? String(rawPayload.lockStatus).toUpperCase() : undefined),
    timestamp: Number.isNaN(timestamp.getTime()) ? new Date() : timestamp,
  };
};

const handleTelemetry = async (deviceId, payload) => {
  const normalized = normalizeTelemetryPayload(payload);
  const resolvedDeviceId = (normalized.serial || deviceId || '').trim().toUpperCase();
  const { lat, lng, speed = 0, battery = 0, odometer = 0, signal, lockStatus, timestamp } = normalized;

  if (lat === null || lng === null) {
    logger.warn(`Telemetry from ${resolvedDeviceId || 'unknown'}: missing/invalid lat/lng`);
    return;
  }

  const coordinates = [lng, lat];

  const vehicle = await Vehicle.findOne({ deviceId: resolvedDeviceId })
    .populate('currentTrip')
    .populate('assignedZones')
    .populate('assignedZone');

  if (!vehicle) {
    logger.warn(`Telemetry from unknown deviceId: ${resolvedDeviceId || deviceId}`);
    return;
  }

  // ── Update Device.lastSeenAt (fire-and-forget, non-blocking) ────────────────
  Device.updateOne(
    { serialNumber: resolvedDeviceId, owner: vehicle.owner },
    { $set: { lastSeenAt: timestamp || new Date() } }
  ).catch(() => {}); // silent — device record may not exist for legacy installs

  const redis = getRedisClient();
  if (redis) {
    await redis.setEx(`scooter:location:${vehicle._id}`, 600, JSON.stringify({
      lat, lng, speed, battery, timestamp, signal, lockStatus,
    }));
  }

  const updateSet = {
    location: { type: 'Point', coordinates },
    isOnline: true,
    'lastTelemetry.speed':     speed,
    'lastTelemetry.battery':   battery,
    'lastTelemetry.odometer':  odometer,
    'lastTelemetry.timestamp': timestamp,
    updatedAt: new Date(),
  };

  if (vehicle.status === 'offline') {
    updateSet.status = vehicle.currentTrip ? 'rented' : 'available';
  }

  if (lockStatus === 'LOCKED') {
    updateSet.status = 'locked';
    updateSet.isEngineOn = false;
  } else if (lockStatus === 'UNLOCKED') {
    updateSet.isEngineOn = true;
    if (vehicle.status === 'locked' || vehicle.status === 'offline') {
      updateSet.status = vehicle.currentTrip ? 'rented' : 'available';
    }
  }

  await Vehicle.updateOne({ _id: vehicle._id }, { $set: updateSet });

  if (vehicle.currentTrip && redis) {
    const routeKey = `trip:route:${vehicle.currentTrip._id}`;
    await redis.rPush(routeKey, JSON.stringify({ coordinates, speed, timestamp }));
    await redis.expire(routeKey, 86400);
  }

  const assignedZones = Array.isArray(vehicle.assignedZones) && vehicle.assignedZones.length
    ? vehicle.assignedZones
    : (vehicle.assignedZone ? [vehicle.assignedZone] : []);

  const zonePolygons = [];
  if (vehicle.geofence?.useCustomZone && vehicle.geofence?.polygon?.coordinates?.[0]?.length) {
    zonePolygons.push({ polygon: vehicle.geofence.polygon, name: vehicle.geofence?.name || 'custom' });
  }
  assignedZones.forEach((z) => {
    if (z?.polygon?.coordinates?.[0]?.length) zonePolygons.push({ polygon: z.polygon, name: z.name || 'zone' });
  });

  if (vehicle.geofence?.isEnabled && zonePolygons.length) {
    const isInside = zonePolygons.some(({ polygon }) => {
      const rings = polygon.coordinates || [];
      const outer = rings[0];
      if (!outer || outer.length < 3) return false;
      const holes = rings.slice(1);
      const isInsideOuter = geofenceService.isPointInPolygon({ lat, lng }, outer);
      if (!isInsideOuter) return false;
      const isInsideHole = holes.some((hole) => geofenceService.isPointInPolygon({ lat, lng }, hole));
      return isInsideOuter && !isInsideHole;
    });

    let previouslyInside = true;
    if (redis) {
      const prev = await redis.get(`scooter:geofence_state:${vehicle._id}`);
      if (prev !== null) previouslyInside = prev === 'inside';
      await redis.setEx(`scooter:geofence_state:${vehicle._id}`, 86400, isInside ? 'inside' : 'outside');
    }

    if (!isInside && previouslyInside) {
      logger.warn(`Geofence EXIT: ${resolvedDeviceId}`);
      publishCommand(resolvedDeviceId, { action: 'lock_engine', reason: 'geofence_exit' });
      await alertService.createAlert({
        scooterId: vehicle._id,
        ownerId: vehicle.owner,
        tripId: vehicle.currentTrip?._id || null,
        type: 'geofence_exit',
        severity: 'critical',
        title: `Geofence Alert: ${vehicle.name}`,
        message: `${vehicle.name} has left its designated zone and the engine has been locked.`,
        coordinates,
      });
      await Vehicle.updateOne({ _id: vehicle._id }, { $set: { status: 'locked' } });
    } else if (isInside && !previouslyInside) {
      await alertService.createAlert({
        scooterId: vehicle._id,
        ownerId: vehicle.owner,
        type: 'geofence_enter',
        severity: 'info',
        title: `${vehicle.name} returned to zone`,
        message: `${vehicle.name} has returned to its designated zone.`,
        coordinates,
      });
    }
  }

  if (battery <= 15 && redis) {
    const alertKey = `scooter:low_battery_alert:${vehicle._id}`;
    const alreadyAlerted = await redis.get(alertKey);
    if (!alreadyAlerted) {
      await redis.setEx(alertKey, 1800, '1');
      await alertService.createAlert({
        scooterId: vehicle._id,
        ownerId: vehicle.owner,
        type: 'low_battery',
        severity: 'warning',
        title: `Low Battery: ${vehicle.name}`,
        message: `${vehicle.name} battery is at ${battery}%.`,
        coordinates,
      });
    }
  }

  const io = getIO();
  if (io) {
    io.to(`owner:${vehicle.owner.toString()}`).emit('scooter:location', {
      scooterId: vehicle._id,
      deviceId: resolvedDeviceId,
      lat, lng, speed, battery, timestamp, signal, lockStatus,
    });
  }
};

module.exports = { handleTelemetry };
