const router = require( "express" ).Router()
const userController = require( "../controller/users-me.controller" );
const authController = require("../controller/auth.controller");


/*************************************************** profile  ROUTES ***************************************************/



router.route("/:id")
    .get(
        authController.protect,
        userController.getUser
    )
    .patch(
        authController.protect,
        userController.updateUser
    )

router.route("/").post(
        userController.changePassword
    )
    
module.exports = router;
