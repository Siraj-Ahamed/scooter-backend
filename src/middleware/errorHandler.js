const logger = require('../utils/logger');
const { sendError } = require('../utils/apiResponse');

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;
  error.statusCode = err.statusCode || 500;

  if (error.statusCode >= 500) {
    logger.error(`🔴 ${req.method} ${req.path} — ${err.message}`, { stack: err.stack });
  } else {
    logger.warn(`🟡 ${req.method} ${req.path} — ${err.message}`);
  }

  if (err.name === 'CastError') {
    error.statusCode = 404;
    error.message = `Resource not found with id: ${err.value}`;
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    error.statusCode = 409;
    error.message = `${field} '${err.keyValue[field]}' already exists.`;
  }

  if (err.name === 'ValidationError') {
    const messages = Object.values(err.errors).map((e) => e.message);
    error.statusCode = 400;
    error.message = 'Validation failed';
    error.errors = messages;
  }

  if (err.name === 'JsonWebTokenError') { error.statusCode = 401; error.message = 'Invalid token.'; }
  if (err.name === 'TokenExpiredError') { error.statusCode = 401; error.message = 'Token expired.'; }

  const isDev = process.env.NODE_ENV === 'development';
  return sendError(res, {
    statusCode: error.statusCode,
    message: error.message,
    errors: error.errors || (isDev ? err.stack : undefined),
  });
};

const notFound = (req, res) =>
  sendError(res, { statusCode: 404, message: `Route not found: ${req.method} ${req.originalUrl}` });

module.exports = { errorHandler, notFound };
