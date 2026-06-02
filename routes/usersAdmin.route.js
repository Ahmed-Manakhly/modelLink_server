const router = require("express").Router();
const authController = require("../controller/auth.controller");

router.use(authController.protect);

router.post(
    '/admins',
    authController.restrictTo('ADMIN'),
    authController.uploadUserFiles,
    authController.createAdmin,
    authController.createUserHandler
);

router.post(
    '/employees',
    authController.restrictTo('ADMIN'),
    authController.uploadUserFiles,
    authController.createEmployee,
    authController.createUserHandler
);
// --------------------------------------------------
router.use(authController.restrictTo('ADMIN', 'EMPLOYEE'));

router.get('/', authController.getAllUsers);
router.get('/:id', authController.getUserById);
router.patch('/:id', authController.uploadUserFiles, authController.updateUser);

module.exports = router;
