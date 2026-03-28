const router  = require('express').Router();
const ctrl    = require('../controllers/deviceController');
const { protect } = require('../middleware/auth');
const { validate, mongoIdRule } = require('../middleware/validate');
const { body } = require('express-validator');

router.use(protect);

const createRules = [
  body('serialNumber').trim().notEmpty().withMessage('Serial number is required'),
  body('name').trim().notEmpty().withMessage('Device name is required'),
  body('deviceType').optional().isIn(['gps_tracker', 'obd_dongle', 'custom_iot', 'sim_module', 'other'])
    .withMessage('Invalid device type'),
  body('status').optional().isIn(['active', 'inactive', 'faulty', 'retired'])
    .withMessage('Invalid status'),
];

const assignRules = [
  body('vehicleId').optional({ nullable: true })
    .custom(v => v === null || v === '' || /^[a-f\d]{24}$/i.test(v))
    .withMessage('vehicleId must be a valid ObjectId or null'),
];

router.route('/')
  .get(ctrl.getDevices)
  .post(createRules, validate, ctrl.createDevice);

router.route('/:id')
  .get(mongoIdRule('id'), validate, ctrl.getDevice)
  .patch(mongoIdRule('id'), validate, ctrl.updateDevice)
  .delete(mongoIdRule('id'), validate, ctrl.deleteDevice);

router.post('/:id/assign', mongoIdRule('id'), assignRules, validate, ctrl.assignDevice);

module.exports = router;
