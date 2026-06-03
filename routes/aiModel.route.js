const router = require("express").Router()
const { createAiModel, getAllAiModels, deleteAiModel, getAiModel, updateAiModel, getUserAiModels, uploadModelFiles } = require("../controller/aiModel.controller");
const authController = require("../controller/auth.controller");

//================================================

// router.route("/").get(authController.protect,authController.restrictTo('ADMIN','CLIENT','DEVELOPER'),getAllAiModels)
router.route("/").get(getAllAiModels)
router.route("/").post(authController.protect, authController.restrictTo('DEVELOPER'), uploadModelFiles, createAiModel)
router.route("/:id").delete(authController.protect, authController.restrictTo('ADMIN', 'DEVELOPER'), deleteAiModel)
router.route("/:id").get(getAiModel)
router.route("/:id").put(authController.protect, authController.restrictTo('ADMIN', 'DEVELOPER'), uploadModelFiles, updateAiModel)
//by manakhly
router.route("/byUser/:id").get(getUserAiModels)
module.exports = router;
