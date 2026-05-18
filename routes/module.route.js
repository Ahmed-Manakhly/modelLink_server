const router = require( "express" ).Router()
const { createModule,getAllModules,deleteModule,getModule,updateModule } = require( "../controller/module.controller" );
const authController = require("../controller/auth.controller");


router.route("/").get(authController.protect,authController.restrictTo('ADMIN','CLIENT','DEVELOPER'),getAllModules)
router.route("/").post(authController.protect,authController.restrictTo('ADMIN','CLIENT','DEVELOPER'),createModule)
router.route("/:id").delete(authController.protect,authController.restrictTo('ADMIN','CLIENT','DEVELOPER'),deleteModule)
router.route("/:id").get(authController.protect,authController.restrictTo('ADMIN','CLIENT','DEVELOPER'),getModule)
router.route("/:id").patch(authController.protect,authController.restrictTo('ADMIN','CLIENT','DEVELOPER'),updateModule)
module.exports = router;
