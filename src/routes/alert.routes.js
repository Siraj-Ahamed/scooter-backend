const router = require('express').Router();
const alertController = require('../controllers/alertController');
const { protect } = require('../middleware/auth');
const { mongoIdRule, validate } = require('../middleware/validate');

router.use(protect);

router.get('/', alertController.getAlerts);
router.patch('/read-all', alertController.markAllRead);
router.patch('/:id/read', mongoIdRule('id'), validate, alertController.markAlertRead);
router.delete('/:id', mongoIdRule('id'), validate, alertController.deleteAlert);

module.exports = router;
