const router = require('express').Router()
const ctrl   = require('../controllers/analyticsController')
const { protect } = require('../middleware/auth')

router.use(protect)

router.get('/summary',              ctrl.getSummary)
router.get('/trips-over-time',      ctrl.getTripsOverTime)
router.get('/distance-per-vehicle', ctrl.getDistancePerVehicle)
router.get('/alerts-by-type',       ctrl.getAlertsByType)
router.get('/peak-hours',           ctrl.getPeakHours)
router.get('/fleet-status',         ctrl.getFleetStatus)
router.get('/top-riders',           ctrl.getTopRiders)

module.exports = router
