const router = require( "express" ).Router()
const userController = require( "../controller/user.controller" );
const authController = require("../controller/auth.controller");


/*************************************************** ADMIN ROUTES ***************************************************/

router.route("/")
    .get(
        authController.protect,
        authController.restrictTo('ADMIN'),
        userController.getAllUsers
    )
    .post(authController.protect,
        authController.restrictTo('ADMIN'),
        userController.createUser);

router.route("/:id")
    .get(authController.protect,
        authController.restrictTo('ADMIN'),
        userController.getUser
    )
    .patch(authController.protect,
        authController.restrictTo('ADMIN'),
        userController.updateUser
    )
    .delete(authController.protect,
        authController.restrictTo('ADMIN'),
        userController.deleteUser
    );

router.route("/unlock-account/:id")
    .patch(authController.protect,
        authController.restrictTo('ADMIN'),
        userController.unlockUserAccount
    );


module.exports = router;
