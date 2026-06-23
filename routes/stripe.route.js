const router = require('express').Router();
const authController = require('../controller/auth.controller');
const stripeConnect = require('../controller/stripeConnect.controller');

router.use(authController.protect);
router.use(authController.restrictTo('DEVELOPER'));

router.get('/connect/status', stripeConnect.getConnectStatus);
router.post('/connect/onboard', stripeConnect.onboardConnect);
router.post('/connect/complete-demo', stripeConnect.completeConnectDemo);

module.exports = router;
