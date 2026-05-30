
const router = require("express").Router();
const authController = require('../controller/auth.controller');

// Public auth (marketplace CLIENT / DEVELOPER)
router.post('/login', authController.login);
router.post('/register', authController.uploadUserFiles, authController.register);
// -------------------
router.post('/create-email-token', authController.createEmailToken);
router.patch('/reset-password', authController.resetPassword);
router.get('/verify-email', authController.verifyEmailToken);

module.exports = router;
