const router = require( "express" ).Router()
const { createAiModel,getAllAiModels,deleteAiModel,getAiModel,updateAiModel,getUserAiModels } = require( "../controller/aiModel.controller" );
const authController = require("../controller/auth.controller");

//================================================

// router.route("/").get(authController.protect,authController.restrictTo('ADMIN','CLIENT','DEVELOPER'),getAllAiModels)
router.route("/").get(getAllAiModels)
// router.route("/").post(authController.protect,authController.restrictTo('DEVELOPER'),createAiModel)
router.route("/").post(createAiModel)
// router.route("/:id").delete(authController.protect,authController.restrictTo('ADMIN','DEVELOPER'),deleteAiModel)
router.route("/:id").delete(deleteAiModel)
// router.route("/:id").get(authController.protect,authController.restrictTo('CLIENT','ADMIN','DEVELOPER'),getAiModel)
router.route("/:id").get(getAiModel)
// router.route("/:id").put(authController.protect,authController.restrictTo('ADMIN','DEVELOPER'),updateAiModel)
router.route("/:id").put(updateAiModel)
//by manakhly
router.route("/byUser/:id").get(getUserAiModels)
module.exports = router;
