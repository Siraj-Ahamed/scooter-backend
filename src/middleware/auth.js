const User = require('../models/User');
const { verifyAccessToken } = require('../utils/jwt');
const { sendError } = require('../utils/apiResponse');
const logger = require('../utils/logger');

const protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return sendError(res, { statusCode: 401, message: 'Access denied. Please log in.' });
    }

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return sendError(res, { statusCode: 401, message: 'Token expired. Please log in again.' });
      }
      return sendError(res, { statusCode: 401, message: 'Invalid token.' });
    }

    const user = await User.findById(decoded.id).select('+passwordChangedAt');
    if (!user) return sendError(res, { statusCode: 401, message: 'User no longer exists.' });
    if (!user.isActive) return sendError(res, { statusCode: 401, message: 'Account is deactivated.' });
    if (user.changedPasswordAfter(decoded.iat)) {
      return sendError(res, { statusCode: 401, message: 'Password recently changed. Please log in again.' });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error(`Auth middleware error: ${error.message}`);
    return sendError(res, { statusCode: 500, message: 'Authentication error.' });
  }
};

const restrictTo = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return sendError(res, { statusCode: 403, message: 'You do not have permission to perform this action.' });
  }
  next();
};

module.exports = { protect, restrictTo };
