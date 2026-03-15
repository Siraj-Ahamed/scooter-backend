const mongoose  = require('mongoose')
const Trip      = require('../models/Trip')
const Alert     = require('../models/Alert')
const Vehicle   = require('../models/Vehicle')
const { audit } = require('../services/auditService')

const toOid = id => new mongoose.Types.ObjectId(id.toString())

// ── helpers ──────────────────────────────────────────────────────────────────
const esc = v => {
  if (v == null) return ''
  const s = String(v).replace(/"/g, '""')
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s
}
const row  = cols => cols.map(esc).join(',')
const fmtD = d => d ? new Date(d).toLocaleString() : ''

// ── CSV — trips ──────────────────────────────────────────────────────────────
const exportTripsCSV = async (req, res, next) => {
  try {
    const owner = toOid(req.user._id)
    const since = req.query.since ? new Date(req.query.since) : new Date(Date.now() - 30 * 86400000)

    const trips = await Trip.find({ owner, startedAt: { $gte: since } })
      .populate('scooter', 'name deviceId vehicleType plateNumber')
      .sort({ startedAt: -1 })
      .lean()

    const header = row(['Trip ID','Vehicle','Device ID','Plate','Rider Name','Rider Phone','Status','Started','Ended','Duration (min)','Distance (km)'])
    const lines  = trips.map(t => row([
      t._id,
      t.scooter?.name   || '',
      t.scooter?.deviceId || '',
      t.scooter?.plateNumber || '',
      t.rider?.name  || '',
      t.rider?.phone || '',
      t.status,
      fmtD(t.startedAt),
      fmtD(t.endedAt),
      t.durationMinutes ?? '',
      t.distanceKm      ?? '',
    ]))

    const csv = [header, ...lines].join('\r\n')
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="trips_export_${Date.now()}.csv"`)
    await audit(req, { action: 'export.csv', description: `Exported ${trips.length} trips as CSV`, meta: { count: trips.length, type: 'trips' } })
    res.send(csv)
  } catch (err) { next(err) }
}

// ── CSV — alerts ─────────────────────────────────────────────────────────────
const exportAlertsCSV = async (req, res, next) => {
  try {
    const owner = toOid(req.user._id)
    const since = req.query.since ? new Date(req.query.since) : new Date(Date.now() - 30 * 86400000)

    const alerts = await Alert.find({ owner, createdAt: { $gte: since } })
      .populate('scooter', 'name deviceId')
      .sort({ createdAt: -1 })
      .lean()

    const header = row(['Alert ID','Type','Severity','Title','Message','Vehicle','Device ID','Read','Created At'])
    const lines  = alerts.map(a => row([
      a._id,
      a.type,
      a.severity,
      a.title,
      a.message,
      a.scooter?.name    || '',
      a.scooter?.deviceId || '',
      a.isRead ? 'Yes' : 'No',
      fmtD(a.createdAt),
    ]))

    const csv = [header, ...lines].join('\r\n')
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="alerts_export_${Date.now()}.csv"`)
    await audit(req, { action: 'export.csv', description: `Exported ${alerts.length} alerts as CSV`, meta: { count: alerts.length, type: 'alerts' } })
    res.send(csv)
  } catch (err) { next(err) }
}

// ── CSV — fleet ───────────────────────────────────────────────────────────────
const exportFleetCSV = async (req, res, next) => {
  try {
    const owner = toOid(req.user._id)
    const vehicles = await Vehicle.find({ owner }).sort({ createdAt: -1 }).lean()

    const header = row(['Vehicle ID','Name','Type','Device ID','Plate','Model','Color','Year','Status','Online','Battery %','Speed km/h','Created At'])
    const lines  = vehicles.map(v => row([
      v._id,
      v.name,
      v.vehicleType,
      v.deviceId,
      v.plateNumber || '',
      v.model       || '',
      v.color       || '',
      v.year        || '',
      v.status,
      v.isOnline ? 'Yes' : 'No',
      v.lastTelemetry?.battery ?? '',
      v.lastTelemetry?.speed   ?? '',
      fmtD(v.createdAt),
    ]))

    const csv = [header, ...lines].join('\r\n')
    res.setHeader('Content-Type', 'text/csv')
    res.setHeader('Content-Disposition', `attachment; filename="fleet_export_${Date.now()}.csv"`)
    await audit(req, { action: 'export.csv', description: `Exported ${vehicles.length} vehicles as CSV`, meta: { count: vehicles.length, type: 'fleet' } })
    res.send(csv)
  } catch (err) { next(err) }
}

// ── PDF — full report (pure HTML → downloadable, no extra lib needed) ────────
// We generate a self-contained HTML file the browser can save/print as PDF.
const exportReportHTML = async (req, res, next) => {
  try {
    const owner = toOid(req.user._id)
    const since = req.query.since ? new Date(req.query.since) : new Date(Date.now() - 30 * 86400000)
    const sinceLabel = new Date(since).toLocaleDateString()

    const [trips, alerts, vehicles] = await Promise.all([
      Trip.find({ owner, startedAt: { $gte: since } }).populate('scooter','name deviceId').sort({ startedAt: -1 }).limit(200).lean(),
      Alert.find({ owner, createdAt: { $gte: since } }).populate('scooter','name').sort({ createdAt: -1 }).limit(200).lean(),
      Vehicle.find({ owner }).sort({ createdAt: -1 }).lean(),
    ])

    const totalKm  = trips.reduce((s, t) => s + (t.distanceKm || 0), 0).toFixed(2)
    const totalMin = trips.reduce((s, t) => s + (t.durationMinutes || 0), 0)
    const onlineV  = vehicles.filter(v => v.isOnline).length

    const tdStyle = `style="padding:6px 10px;border:1px solid #334155;font-size:12px;"`
    const thStyle = `style="padding:6px 10px;border:1px solid #334155;background:#1e293b;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:#94a3b8;font-weight:600;"`

    const tripRows = trips.map(t => `
      <tr>
        <td ${tdStyle}>${t.scooter?.name || '-'}</td>
        <td ${tdStyle}>${t.rider?.name || '-'}</td>
        <td ${tdStyle}>${t.status}</td>
        <td ${tdStyle}>${fmtD(t.startedAt)}</td>
        <td ${tdStyle}>${t.durationMinutes ?? '-'} min</td>
        <td ${tdStyle}>${t.distanceKm ?? '-'} km</td>
      </tr>`).join('')

    const alertRows = alerts.map(a => `
      <tr>
        <td ${tdStyle}>${a.type.replace(/_/g,' ')}</td>
        <td ${tdStyle}>${a.severity}</td>
        <td ${tdStyle}>${a.title}</td>
        <td ${tdStyle}>${a.scooter?.name || '-'}</td>
        <td ${tdStyle}>${a.isRead ? 'Read' : 'Unread'}</td>
        <td ${tdStyle}>${fmtD(a.createdAt)}</td>
      </tr>`).join('')

    const fleetRows = vehicles.map(v => `
      <tr>
        <td ${tdStyle}>${v.name}</td>
        <td ${tdStyle}>${v.vehicleType}</td>
        <td ${tdStyle}>${v.deviceId}</td>
        <td ${tdStyle}>${v.status}</td>
        <td ${tdStyle}>${v.isOnline ? '✔ Online' : '✘ Offline'}</td>
        <td ${tdStyle}>${v.lastTelemetry?.battery ?? '-'}%</td>
      </tr>`).join('')

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>FleetOps Report — ${new Date().toLocaleDateString()}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0d1117;color:#e2e8f0;padding:32px 40px}
  h1{font-size:22px;font-weight:700;color:#f8fafc;margin-bottom:4px}
  .sub{font-size:12px;color:#64748b;margin-bottom:32px}
  .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:32px}
  .kpi{background:#161b22;border:1px solid #21262d;border-radius:8px;padding:14px 18px}
  .kpi-label{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:4px}
  .kpi-value{font-size:24px;font-weight:700;color:#38bdf8;font-family:monospace}
  h2{font-size:14px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:10px;margin-top:28px;padding-bottom:6px;border-bottom:1px solid #21262d}
  table{width:100%;border-collapse:collapse;margin-bottom:8px}
  tr:nth-child(even) td{background:#111827}
  @media print{body{background:#fff;color:#111}table{page-break-inside:auto}tr{page-break-inside:avoid}h2{color:#475569}}
</style>
</head>
<body>
<h1>FleetOps Fleet Report</h1>
<div class="sub">Generated ${new Date().toLocaleString()} &nbsp;·&nbsp; Period from ${sinceLabel}</div>

<div class="kpis">
  <div class="kpi"><div class="kpi-label">Total Trips</div><div class="kpi-value">${trips.length}</div></div>
  <div class="kpi"><div class="kpi-label">Total Distance</div><div class="kpi-value">${totalKm} km</div></div>
  <div class="kpi"><div class="kpi-label">Fleet Size</div><div class="kpi-value">${vehicles.length}</div></div>
  <div class="kpi"><div class="kpi-label">Online Now</div><div class="kpi-value">${onlineV}</div></div>
</div>

<h2>Trips (${trips.length})</h2>
<table>
<thead><tr><th ${thStyle}>Vehicle</th><th ${thStyle}>Rider</th><th ${thStyle}>Status</th><th ${thStyle}>Started</th><th ${thStyle}>Duration</th><th ${thStyle}>Distance</th></tr></thead>
<tbody>${tripRows || '<tr><td colspan="6" style="text-align:center;padding:20px;color:#64748b;">No trips</td></tr>'}</tbody>
</table>

<h2>Alerts (${alerts.length})</h2>
<table>
<thead><tr><th ${thStyle}>Type</th><th ${thStyle}>Severity</th><th ${thStyle}>Title</th><th ${thStyle}>Vehicle</th><th ${thStyle}>Status</th><th ${thStyle}>Time</th></tr></thead>
<tbody>${alertRows || '<tr><td colspan="6" style="text-align:center;padding:20px;color:#64748b;">No alerts</td></tr>'}</tbody>
</table>

<h2>Fleet (${vehicles.length} vehicles)</h2>
<table>
<thead><tr><th ${thStyle}>Name</th><th ${thStyle}>Type</th><th ${thStyle}>Device ID</th><th ${thStyle}>Status</th><th ${thStyle}>Connection</th><th ${thStyle}>Battery</th></tr></thead>
<tbody>${fleetRows || '<tr><td colspan="6" style="text-align:center;padding:20px;color:#64748b;">No vehicles</td></tr>'}</tbody>
</table>

<script>window.onload=()=>window.print()</script>
</body></html>`

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="fleetops_report_${Date.now()}.html"`)
    await audit(req, { action: 'export.pdf', description: `Exported HTML report (${trips.length} trips, ${alerts.length} alerts)`, meta: { trips: trips.length, alerts: alerts.length } })
    res.send(html)
  } catch (err) { next(err) }
}

module.exports = { exportTripsCSV, exportAlertsCSV, exportFleetCSV, exportReportHTML }
