
const router = require("express").Router();
const authController = require('../controller/auth.controller');

// Logged-in user profile
router.use(authController.protect);

router.get('/me', authController.getMe);
router.patch('/me', authController.uploadUserFiles, authController.updateMe);
router.patch('/change-password', authController.changePassword);
router.get('/users/:id', authController.getUserPublicProfile);

module.exports = router;
