
const router = require("express").Router();
const authController = require('../controller/auth.controller');

// Logged-in user profile
router.use(authController.protect);

router.get('/', authController.getMe);
router.patch('/', authController.uploadUserFiles, authController.updateMe);
router.patch('/change-password', authController.changePassword);
router.get('/:id', authController.getUserPublicProfile);

module.exports = router;
