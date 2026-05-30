const router = require("express").Router();
const authController = require("../controller/auth.controller");

router.use(authController.protect);
router.use(authController.restrictTo('ADMIN'));


router.post(
    '/admins',
    authController.uploadUserFiles,
    authController.createAdmin,
    authController.createUserHandler
);

router.post(
    '/employees',
    authController.uploadUserFiles,
    authController.createEmployee,
    authController.createUserHandler
);
// --------------------------------------------------
router.use(authController.restrictTo('ADMIN', 'EMPLOYEE'))

router.get('/', authController.getAllUsers);
router.get('/:id', authController.getUserById);
router.patch('/:id', authController.uploadUserFiles, authController.updateUser);

module.exports = router;
