const mongoose = require('mongoose')

const auditLogSchema = new mongoose.Schema(
  {
    owner:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actor:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    actorName:  { type: String, required: true },
    actorEmail: { type: String },
    action:     {
      type: String,
      required: true,
      enum: [
        // vehicles
        'vehicle.create', 'vehicle.update', 'vehicle.delete',
        'vehicle.command', 'vehicle.geofence',
        // trips
        'trip.start', 'trip.end',
        // zones
        'zone.create', 'zone.update', 'zone.delete', 'zone.assign',
        // alerts
        'alert.read', 'alert.readAll', 'alert.delete',
        // auth
        'auth.login', 'auth.logout',
        // exports
        'export.csv', 'export.pdf',
      ],
    },
    // human-readable sentence e.g. "Sent lock_engine to vehicle Scooter-01"
    description: { type: String, required: true },
    // optional structured metadata
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    // resource that was affected
    resourceType: { type: String, enum: ['vehicle','trip','zone','alert','user','export',null], default: null },
    resourceId:   { type: mongoose.Schema.Types.ObjectId, default: null },
    resourceName: { type: String, default: '' },
    // request context
    ip:        { type: String, default: '' },
    userAgent: { type: String, default: '' },
    status:    { type: String, enum: ['success','failure'], default: 'success' },
  },
  { timestamps: true }
)

auditLogSchema.index({ owner: 1, createdAt: -1 })
auditLogSchema.index({ actor: 1 })
auditLogSchema.index({ action: 1 })

const AuditLog = mongoose.model('AuditLog', auditLogSchema)
module.exports = AuditLog
