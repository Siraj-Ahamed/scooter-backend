const router = require('express').Router();
const scooterController = require('../controllers/scooterController');
const { protect } = require('../middleware/auth');
const { validate, createScooterValidationRules, geofenceValidationRules, mongoIdRule } = require('../middleware/validate');

router.use(protect);

router.route('/')
  .get(scooterController.getScooters)
  .post(createScooterValidationRules, validate, scooterController.createScooter);

router.route('/:id')
  .get(mongoIdRule('id'), validate, scooterController.getScooter)
  .patch(mongoIdRule('id'), validate, scooterController.updateScooter)
  .delete(mongoIdRule('id'), validate, scooterController.deleteScooter);

router.get('/:id/location', mongoIdRule('id'), validate, scooterController.getScooterLocation);
router.patch('/:id/geofence', mongoIdRule('id'), geofenceValidationRules, validate, scooterController.setGeofence);
router.post('/:id/command', mongoIdRule('id'), validate, scooterController.sendScooterCommand);

module.exports = router;
