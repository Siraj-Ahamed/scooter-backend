const sendSuccess = (res, { statusCode = 200, message = 'Success', data = null, pagination = null } = {}) => {
  const response = {
    success: true,
    message,
    ...(data !== null && { data }),
    ...(pagination && { pagination }),
  };
  return res.status(statusCode).json(response);
};

const sendError = (res, { statusCode = 500, message = 'Something went wrong', errors = null } = {}) => {
  const response = {
    success: false,
    message,
    ...(errors && { errors }),
  };
  return res.status(statusCode).json(response);
};

module.exports = { sendSuccess, sendError };
