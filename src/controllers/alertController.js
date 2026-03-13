const Alert = require('../models/Alert');
const { markAsRead } = require('../services/alertService');
const { sendSuccess, sendError } = require('../utils/apiResponse');

const getAlerts = async (req, res, next) => {
  try {
    const { page = 1, limit = 30, unreadOnly } = req.query;
    const filter = { owner: req.user._id, ...(unreadOnly === 'true' && { isRead: false }) };
    const result = await Alert.paginate(filter, {
      page: parseInt(page), limit: parseInt(limit), sort: { createdAt: -1 },
      populate: { path: 'scooter', select: 'name deviceId' },
    });
    const unreadCount = await Alert.countDocuments({ owner: req.user._id, isRead: false });
    return sendSuccess(res, {
      data: result.docs,
      pagination: { total: result.totalDocs, page: result.page, pages: result.totalPages },
      meta: { unreadCount },
    });
  } catch (error) { next(error); }
};

const markAlertRead = async (req, res, next) => {
  try {
    await markAsRead(req.user._id, req.params.id);
    return sendSuccess(res, { message: 'Alert marked as read' });
  } catch (error) { next(error); }
};

const markAllRead = async (req, res, next) => {
  try {
    await markAsRead(req.user._id);
    return sendSuccess(res, { message: 'All alerts marked as read' });
  } catch (error) { next(error); }
};

const deleteAlert = async (req, res, next) => {
  try {
    const result = await Alert.findOneAndDelete({ _id: req.params.id, owner: req.user._id });
    if (!result) return sendError(res, { statusCode: 404, message: 'Alert not found.' });
    return sendSuccess(res, { message: 'Alert deleted' });
  } catch (error) { next(error); }
};

module.exports = { getAlerts, markAlertRead, markAllRead, deleteAlert };
