const router = require('express').Router();
const tripController = require('../controllers/tripController');
const { protect } = require('../middleware/auth');
const { mongoIdRule, validate } = require('../middleware/validate');
const { body } = require('express-validator');

router.use(protect);

router.get('/active', tripController.getActiveTrips);
router.get('/', tripController.getTrips);
router.get('/:id', mongoIdRule('id'), validate, tripController.getTrip);

router.post('/start',
  [
    body('scooterId').isMongoId().withMessage('Invalid scooter ID'),
    body('riderName').trim().notEmpty().withMessage('Rider name is required'),
    body('riderPhone').trim().notEmpty().withMessage('Rider phone is required'),
  ],
  validate,
  tripController.startTrip
);

router.post('/:id/end', mongoIdRule('id'), validate, tripController.endTrip);

module.exports = router;
