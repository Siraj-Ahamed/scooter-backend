const router = require('express').Router();
const authController = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { validate, registerValidationRules, loginValidationRules } = require('../middleware/validate');

router.post('/register', registerValidationRules, validate, authController.register);
router.post('/login', loginValidationRules, validate, authController.login);
router.post('/refresh', authController.refreshToken);
router.post('/logout', protect, authController.logout);
router.get('/me', protect, authController.getMe);
router.patch('/me', protect, authController.updateMe);

module.exports = router;
