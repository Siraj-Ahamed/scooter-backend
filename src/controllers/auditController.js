const mongoose = require('mongoose')
const AuditLog  = require('../models/AuditLog')
const { sendSuccess } = require('../utils/apiResponse')

const getLogs = async (req, res, next) => {
  try {
    const owner  = new mongoose.Types.ObjectId(req.user._id.toString())
    const { page = 1, limit = 50, action, resourceType, search, since } = req.query
    const filter = { owner }
    if (action)       filter.action = action
    if (resourceType) filter.resourceType = resourceType
    if (since)        filter.createdAt = { $gte: new Date(since) }
    if (search) {
      filter.$or = [
        { description:  { $regex: search, $options: 'i' } },
        { actorName:    { $regex: search, $options: 'i' } },
        { resourceName: { $regex: search, $options: 'i' } },
      ]
    }

    const total = await AuditLog.countDocuments(filter)
    const logs  = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean()

    return sendSuccess(res, {
      data: logs,
      pagination: {
        total,
        page:  parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        limit: parseInt(limit),
      },
    })
  } catch (err) { next(err) }
}

module.exports = { getLogs }
