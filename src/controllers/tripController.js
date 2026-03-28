const Trip = require('../models/Trip');
const Scooter = require('../models/Scooter');
const { getRedisClient } = require('../config/redis');
const { getIO } = require('../socket/socketServer');
const { calculateRouteDistance } = require('../services/geofenceService');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const logger = require('../utils/logger');

const startTrip = async (req, res, next) => {
  try {
    const { scooterId, riderName, riderPhone } = req.body;
    const scooter = await Scooter.findOne({ _id: scooterId, owner: req.user._id });
    if (!scooter) return sendError(res, { statusCode: 404, message: 'Scooter not found.' });
    if (scooter.status === 'rented') return sendError(res, { statusCode: 400, message: 'Scooter is already rented.' });
    if (!scooter.isOnline) return sendError(res, { statusCode: 400, message: 'Scooter is offline.' });

    const trip = await Trip.create({
      scooter: scooter._id,
      owner: req.user._id,
      rider: { name: riderName, phone: riderPhone },
      startLocation: { coordinates: scooter.location.coordinates },
      events: [{ type: 'trip_started', message: `Trip started`, location: scooter.location.coordinates }],
    });

    await Scooter.updateOne({ _id: scooter._id }, { $set: { status: 'rented', currentTrip: trip._id } });
    logger.info(`🚀 Trip started: ${trip._id}`);

    const io = getIO();
    if (io) {
      io.to(`owner:${req.user._id.toString()}`).emit('trip:started', {
        tripId: trip._id, scooterId: scooter._id, deviceId: scooter.deviceId, rider: trip.rider, startedAt: trip.startedAt,
      });
    }

    return sendSuccess(res, { statusCode: 201, message: 'Trip started', data: trip });
  } catch (error) { next(error); }
};

const endTrip = async (req, res, next) => {
  try {
    const trip = await Trip.findOne({ _id: req.params.id, owner: req.user._id, status: 'active' }).populate('scooter');
    if (!trip) return sendError(res, { statusCode: 404, message: 'Active trip not found.' });

    const endTime = new Date();
    const durationMinutes = Math.round((endTime - trip.startedAt) / 60000);

    const redis = getRedisClient();
    let route = [];
    let distanceKm = 0;

    if (redis) {
      const routeKey = `trip:route:${trip._id}`;
      const rawPoints = await redis.lRange(routeKey, 0, -1);
      if (rawPoints.length > 0) {
        route = rawPoints.map((p) => JSON.parse(p));
        distanceKm = calculateRouteDistance(route.map((p) => ({ lat: p.coordinates[1], lng: p.coordinates[0] })));
      }
      await redis.del(routeKey);
    } else if (Array.isArray(trip.route) && trip.route.length > 0) {
      route = trip.route;
      distanceKm = calculateRouteDistance(route.map((p) => ({ lat: p.coordinates[1], lng: p.coordinates[0] })));
    }

    const endCoordinates = trip.scooter.location?.coordinates || [0, 0];
    trip.status = 'completed';
    trip.endedAt = endTime;
    trip.durationMinutes = durationMinutes;
    trip.distanceKm = distanceKm;
    trip.endLocation = { coordinates: endCoordinates };
    trip.route = route.slice(0, 2000);
    trip.events.push({ type: 'trip_ended', message: `Trip ended. Duration: ${durationMinutes}min, Distance: ${distanceKm}km`, location: endCoordinates });
    await trip.save();

    await Scooter.updateOne({ _id: trip.scooter._id }, { $set: { status: 'available', currentTrip: null } });
    logger.info(`🏁 Trip ended: ${trip._id}`);

    const io = getIO();
    if (io) {
      io.to(`owner:${req.user._id.toString()}`).emit('trip:ended', {
        tripId: trip._id, scooterId: trip.scooter._id, durationMinutes, distanceKm,
      });
    }

    return sendSuccess(res, { message: 'Trip ended', data: { tripId: trip._id, durationMinutes, distanceKm } });
  } catch (error) { next(error); }
};

const getActiveTrips = async (req, res, next) => {
  try {
    const trips = await Trip.find({ owner: req.user._id, status: 'active' })
      .populate('scooter', 'name deviceId vehicleType location lastTelemetry isOnline');
    return sendSuccess(res, { data: trips });
  } catch (error) { next(error); }
};

const getTrips = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, scooterId, status } = req.query;
    const filter = { owner: req.user._id, ...(scooterId && { scooter: scooterId }), ...(status && { status }) };
    const result = await Trip.paginate(filter, {
      page: parseInt(page), limit: parseInt(limit), sort: { startedAt: -1 },
      populate: { path: 'scooter', select: 'name deviceId vehicleType' },
      select: '-route',
    });
    return sendSuccess(res, {
      data: result.docs,
      pagination: { total: result.totalDocs, page: result.page, pages: result.totalPages },
    });
  } catch (error) { next(error); }
};

const getTrip = async (req, res, next) => {
  try {
    const trip = await Trip.findOne({ _id: req.params.id, owner: req.user._id })
      .populate('scooter', 'name deviceId vehicleType');
    if (!trip) return sendError(res, { statusCode: 404, message: 'Trip not found.' });
    return sendSuccess(res, { data: trip });
  } catch (error) { next(error); }
};

module.exports = { startTrip, endTrip, getActiveTrips, getTrips, getTrip };
