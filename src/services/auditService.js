const AuditLog = require('../models/AuditLog')

/**
 * Write an audit log entry. Call this from any controller after a successful
 * action. Never throws — audit logging must not break the main request flow.
 *
 * Usage:
 *   await audit(req, {
 *     action:       'vehicle.command',
 *     description:  `Sent lock_engine to vehicle ${vehicle.name}`,
 *     resourceType: 'vehicle',
 *     resourceId:   vehicle._id,
 *     resourceName: vehicle.name,
 *     meta:         { command: action },
 *   })
 */
const audit = async (req, { action, description, resourceType = null, resourceId = null, resourceName = '', meta = {}, status = 'success' }) => {
  try {
    await AuditLog.create({
      owner:        req.user._id,
      actor:        req.user._id,
      actorName:    req.user.name,
      actorEmail:   req.user.email,
      action,
      description,
      resourceType,
      resourceId,
      resourceName,
      meta,
      ip:        req.ip || req.connection?.remoteAddress || '',
      userAgent: req.headers?.['user-agent']?.slice(0, 200) || '',
      status,
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[audit] Failed to write audit log:', err.message)
  }
}

module.exports = { audit }
