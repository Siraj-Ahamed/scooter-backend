'use strict';

const express    = require('express');
const router     = express.Router();
const controller = require('../controllers/zscoreController');

// Uncomment `protect` if you want these routes behind JWT auth:
// const { protect } = require('../middleware/auth');

router.post(  '/analyse',      /* protect, */ controller.analyse);
router.get(   '/sessions',     /* protect, */ controller.getSessions);
router.get(   '/sessions/:id', /* protect, */ controller.getSession);
router.delete('/sessions/:id', /* protect, */ controller.deleteSession);

module.exports = router;
