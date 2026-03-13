const router = require('express').Router();
const vehicleController = require('../controllers/vehicleController');
const { protect } = require('../middleware/auth');
const { validate, createVehicleValidationRules, geofenceValidationRules, mongoIdRule } = require('../middleware/validate');

router.use(protect);

router.route('/')
  .get(vehicleController.getVehicles)
  .post(createVehicleValidationRules, validate, vehicleController.createVehicle);

router.route('/:id')
  .get(mongoIdRule('id'), validate, vehicleController.getVehicle)
  .patch(mongoIdRule('id'), validate, vehicleController.updateVehicle)
  .delete(mongoIdRule('id'), validate, vehicleController.deleteVehicle);

router.get('/:id/location',  mongoIdRule('id'), validate, vehicleController.getVehicleLocation);
router.patch('/:id/geofence', mongoIdRule('id'), geofenceValidationRules, validate, vehicleController.setGeofence);
router.post('/:id/command',  mongoIdRule('id'), validate, vehicleController.sendVehicleCommand);

module.exports = router;
