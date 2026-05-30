const router = require("express").Router()
const { createTarget, getAllTargets, deleteTarget, getTarget, updateTarget } = require("../controller/target.controller");
const authController = require("../controller/auth.controller");


router.route("/").get(authController.protect, authController.restrictTo('ADMIN', 'CLIENT', 'DEVELOPER'), getAllTargets)
router.route("/").post(authController.protect, authController.restrictTo('ADMIN', 'CLIENT', 'DEVELOPER'), createTarget)
router.route("/:id").delete(authController.protect, authController.restrictTo('ADMIN', 'CLIENT', 'DEVELOPER'), deleteTarget)
router.route("/:id").get(authController.protect, authController.restrictTo('ADMIN', 'CLIENT', 'DEVELOPER'), getTarget)
router.route("/:id").patch(authController.protect, authController.restrictTo('ADMIN', 'CLIENT', 'DEVELOPER'), updateTarget)
module.exports = router;
