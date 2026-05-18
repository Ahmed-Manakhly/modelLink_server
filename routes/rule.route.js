const router = require( "express" ).Router()
const { createRule,getAllRules,deleteRule,getRule,updateRule } = require( "../controller/rule.controller" );
const authController = require("../controller/auth.controller");


router.route("/").get(authController.protect,authController.restrictTo('ADMIN','CLIENT','DEVELOPER'),getAllRules)
router.route("/").post(authController.protect,authController.restrictTo('ADMIN','CLIENT','DEVELOPER'),createRule)
router.route("/:id").delete(authController.protect,authController.restrictTo('ADMIN','CLIENT','DEVELOPER'),deleteRule)
router.route("/:id").get(authController.protect,authController.restrictTo('ADMIN','CLIENT','DEVELOPER'),getRule)
router.route("/:id").patch(authController.protect,authController.restrictTo('ADMIN','CLIENT','DEVELOPER'),updateRule)
module.exports = router;
