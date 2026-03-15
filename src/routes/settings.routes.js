const router = require('express').Router()
const { protect } = require('../middleware/auth')
const auditCtrl  = require('../controllers/auditController')
const exportCtrl = require('../controllers/exportController')

// For file downloads the token arrives as ?token= query param
// Inject it into the Authorization header so the protect middleware works
router.use((req, res, next) => {
  if (req.query.token && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${req.query.token}`
  }
  next()
})

router.use(protect)

// Audit log
router.get('/logs',               auditCtrl.getLogs)

// CSV exports
router.get('/export/trips.csv',   exportCtrl.exportTripsCSV)
router.get('/export/alerts.csv',  exportCtrl.exportAlertsCSV)
router.get('/export/fleet.csv',   exportCtrl.exportFleetCSV)

// HTML report (open-in-browser + print-to-PDF)
router.get('/export/report.html', exportCtrl.exportReportHTML)

module.exports = router
