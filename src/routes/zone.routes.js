const router = require('express').Router();
const zoneController = require('../controllers/zoneController');
const { protect } = require('../middleware/auth');
const { validate, mongoIdRule } = require('../middleware/validate');
const { body } = require('express-validator');

router.use(protect);

const createZoneRules = [
  body('name').trim().notEmpty().withMessage('Zone name is required'),
  body('polygon').notEmpty().withMessage('polygon is required'),
];

router.route('/')
  .get(zoneController.getZones)
  .post(createZoneRules, validate, zoneController.createZone);

router.route('/:id')
  .get(mongoIdRule('id'), validate, zoneController.getZone)
  .patch(mongoIdRule('id'), validate, zoneController.updateZone)
  .delete(mongoIdRule('id'), validate, zoneController.deleteZone);

router.patch('/:id/assign', mongoIdRule('id'), validate, zoneController.assignZoneToVehicle);

module.exports = router;
