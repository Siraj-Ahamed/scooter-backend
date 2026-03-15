const mongoose = require('mongoose')
const Trip    = require('../models/Trip')
const Alert   = require('../models/Alert')
const Vehicle = require('../models/Vehicle')
const { sendSuccess } = require('../utils/apiResponse')

const toOid = id => new mongoose.Types.ObjectId(id.toString())

// ─── GET /api/v1/analytics/summary ──────────────────────────────────────────
const getSummary = async (req, res, next) => {
  try {
    const owner = toOid(req.user._id)
    // since filters all time-series metrics; fleet size & online are always current
    const since = req.query.since ? new Date(req.query.since) : new Date(0)
    const tripFilter  = { owner, startedAt: { $gte: since } }
    const alertFilter = { owner, isRead: false, createdAt: { $gte: since } }

    const [
      totalTrips, activeTrips, completedTrips,
      totalVehicles, onlineVehicles, unreadAlerts,
      distAgg, durationAgg,
    ] = await Promise.all([
      Trip.countDocuments(tripFilter),
      Trip.countDocuments({ owner, status: 'active' }),
      Trip.countDocuments({ ...tripFilter, status: 'completed' }),
      Vehicle.countDocuments({ owner }),
      Vehicle.countDocuments({ owner, isOnline: true }),
      Alert.countDocuments(alertFilter),
      Trip.aggregate([
        { $match: { ...tripFilter, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$distanceKm' } } },
      ]),
      Trip.aggregate([
        { $match: { ...tripFilter, status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$durationMinutes' } } },
      ]),
    ])

    return sendSuccess(res, {
      data: {
        totalTrips, activeTrips, completedTrips,
        totalVehicles, onlineVehicles, unreadAlerts,
        totalDistanceKm:      +(distAgg[0]?.total     || 0).toFixed(2),
        totalDurationMinutes: Math.round(durationAgg[0]?.total || 0),
      },
    })
  } catch (err) { next(err) }
}

// ─── GET /api/v1/analytics/trips-over-time ───────────────────────────────────
const getTripsOverTime = async (req, res, next) => {
  try {
    const owner = toOid(req.user._id)
    const days  = Math.min(parseInt(req.query.days) || 30, 365)
    const since = new Date(Date.now() - days * 86400000)

    const agg = await Trip.aggregate([
      { $match: { owner, startedAt: { $gte: since } } },
      {
        $group: {
          _id: {
            y: { $year:       '$startedAt' },
            m: { $month:      '$startedAt' },
            d: { $dayOfMonth: '$startedAt' },
          },
          count:       { $sum: 1 },
          completed:   { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          distanceKm:  { $sum: '$distanceKm' },
          durationMin: { $sum: '$durationMinutes' },
        },
      },
      { $sort: { '_id.y': 1, '_id.m': 1, '_id.d': 1 } },
    ])

    const map = {}
    agg.forEach(d => {
      const key = `${d._id.y}-${String(d._id.m).padStart(2,'0')}-${String(d._id.d).padStart(2,'0')}`
      map[key] = d
    })

    const result = []
    for (let i = days - 1; i >= 0; i--) {
      const dt  = new Date(Date.now() - i * 86400000)
      const key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`
      const d   = map[key]
      result.push({
        date:        key,
        count:       d?.count       || 0,
        completed:   d?.completed   || 0,
        distanceKm:  +(d?.distanceKm  || 0).toFixed(2),
        durationMin: Math.round(d?.durationMin || 0),
      })
    }

    return sendSuccess(res, { data: result })
  } catch (err) { next(err) }
}

// ─── GET /api/v1/analytics/distance-per-vehicle ──────────────────────────────
const getDistancePerVehicle = async (req, res, next) => {
  try {
    const owner = toOid(req.user._id)
    const since = req.query.since ? new Date(req.query.since) : new Date(0)

    const agg = await Trip.aggregate([
      { $match: { owner, status: 'completed', startedAt: { $gte: since } } },
      {
        $group: {
          _id:         '$scooter',
          totalKm:     { $sum: '$distanceKm' },
          tripCount:   { $sum: 1 },
          avgDuration: { $avg: '$durationMinutes' },
          avgDistance: { $avg: '$distanceKm' },
        },
      },
      { $sort: { totalKm: -1 } },
      { $limit: 20 },
      {
        $lookup: {
          from:         'scooters',
          localField:   '_id',
          foreignField: '_id',
          as:           'vehicle',
        },
      },
      { $unwind: { path: '$vehicle', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          vehicleId:   '$_id',
          name:        { $ifNull: ['$vehicle.name', 'Unknown'] },
          vehicleType: { $ifNull: ['$vehicle.vehicleType', 'scooter'] },
          totalKm:     { $round: ['$totalKm', 2] },
          tripCount:   1,
          avgDuration: { $round: ['$avgDuration', 1] },
          avgDistance: { $round: ['$avgDistance', 2] },
        },
      },
    ])

    return sendSuccess(res, { data: agg })
  } catch (err) { next(err) }
}

// ─── GET /api/v1/analytics/alerts-by-type ────────────────────────────────────
const getAlertsByType = async (req, res, next) => {
  try {
    const owner = toOid(req.user._id)
    const since = req.query.since ? new Date(req.query.since) : new Date(Date.now() - 30 * 86400000)

    const agg = await Alert.aggregate([
      { $match: { owner, createdAt: { $gte: since } } },
      {
        $group: {
          _id:   { type: '$type', severity: '$severity' },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ])

    const byType = {}
    agg.forEach(d => {
      byType[d._id.type] = (byType[d._id.type] || 0) + d.count
    })

    return sendSuccess(res, {
      data: {
        detailed: agg.map(d => ({ type: d._id.type, severity: d._id.severity, count: d.count })),
        byType:   Object.entries(byType)
          .map(([type, count]) => ({ type, count }))
          .sort((a, b) => b.count - a.count),
      },
    })
  } catch (err) { next(err) }
}

// ─── GET /api/v1/analytics/peak-hours ────────────────────────────────────────
const getPeakHours = async (req, res, next) => {
  try {
    const owner = toOid(req.user._id)
    const since = req.query.since ? new Date(req.query.since) : new Date(Date.now() - 90 * 86400000)

    const agg = await Trip.aggregate([
      { $match: { owner, startedAt: { $gte: since } } },
      {
        $group: {
          _id: {
            hour: { $hour:      '$startedAt' },
            dow:  { $dayOfWeek: '$startedAt' }, // 1=Sun…7=Sat
          },
          count: { $sum: 1 },
        },
      },
    ])

    const matrix = Array.from({ length: 7 }, () => new Array(24).fill(0))
    agg.forEach(d => {
      matrix[d._id.dow - 1][d._id.hour] = d.count
    })

    return sendSuccess(res, {
      data: {
        matrix,
        days:  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],
        hours: Array.from({ length: 24 }, (_, i) => i),
      },
    })
  } catch (err) { next(err) }
}

// ─── GET /api/v1/analytics/fleet-status ──────────────────────────────────────
const getFleetStatus = async (req, res, next) => {
  try {
    const owner = toOid(req.user._id)

    const [statusAgg, typeAgg] = await Promise.all([
      Vehicle.aggregate([
        { $match: { owner } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Vehicle.aggregate([
        { $match: { owner } },
        { $group: { _id: '$vehicleType', count: { $sum: 1 } } },
      ]),
    ])

    return sendSuccess(res, {
      data: {
        byStatus: statusAgg.map(d => ({ status: d._id, count: d.count })),
        byType:   typeAgg.map(d => ({ type: d._id, count: d.count })),
      },
    })
  } catch (err) { next(err) }
}

// ─── GET /api/v1/analytics/top-riders ────────────────────────────────────────
const getTopRiders = async (req, res, next) => {
  try {
    const owner = toOid(req.user._id)
    const since = req.query.since ? new Date(req.query.since) : new Date(Date.now() - 30 * 86400000)

    const agg = await Trip.aggregate([
      { $match: { owner, status: 'completed', startedAt: { $gte: since } } },
      {
        $group: {
          _id:       '$rider.phone',
          name:      { $last: '$rider.name' },
          phone:     { $last: '$rider.phone' },
          tripCount: { $sum: 1 },
          totalKm:   { $sum: '$distanceKm' },
          totalMins: { $sum: '$durationMinutes' },
        },
      },
      { $sort: { tripCount: -1 } },
      { $limit: 10 },
      {
        $project: {
          _id: 0,
          name: 1, phone: 1, tripCount: 1,
          totalKm:   { $round: ['$totalKm', 2] },
          totalMins: 1,
        },
      },
    ])

    return sendSuccess(res, { data: agg })
  } catch (err) { next(err) }
}

module.exports = {
  getSummary,
  getTripsOverTime,
  getDistancePerVehicle,
  getAlertsByType,
  getPeakHours,
  getFleetStatus,
  getTopRiders,
}
