const { validationResult, body, param } = require('express-validator');
const { sendError } = require('../utils/apiResponse');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return sendError(res, {
      statusCode: 400,
      message: 'Validation failed',
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

const registerValidationRules = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ min: 2, max: 50 }).withMessage('Name must be 2-50 characters'),
  body('email').trim().notEmpty().withMessage('Email is required').isEmail().withMessage('Invalid email').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required').isLength({ min: 8 }).withMessage('Password min 8 characters'),
  body('phone').optional().isMobilePhone().withMessage('Invalid phone number'),
  body('role').optional().isIn(['owner', 'admin']).withMessage('Role must be owner or admin'),
];

const loginValidationRules = [
  body('email').trim().notEmpty().withMessage('Email is required').isEmail().normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

const createScooterValidationRules = [
  body('name').trim().notEmpty().withMessage('Vehicle name is required'),
  body('deviceId').trim().notEmpty().withMessage('Device ID is required'),
];

const createVehicleValidationRules = [
  body('name').trim().notEmpty().withMessage('Vehicle name is required'),
  body('deviceId').trim().notEmpty().withMessage('Device ID is required'),
  body('vehicleType').optional().isIn(['scooter','motorcycle','car','van','truck','bicycle','bus','other']).withMessage('Invalid vehicle type'),
];

const geofenceValidationRules = [
  body('isEnabled').isBoolean().withMessage('isEnabled must be a boolean'),
];

const mongoIdRule = (field = 'id') =>
  param(field).isMongoId().withMessage(`Invalid ${field} format`);

module.exports = { validate, registerValidationRules, loginValidationRules, createScooterValidationRules, createVehicleValidationRules, geofenceValidationRules, mongoIdRule };
