const router = require("express").Router();
const controller = require("../controller/developerVerification.controller");
const authController = require("../controller/auth.controller");

// Developer-only routes
router.post(
    "/submit",
    authController.protect,
    authController.restrictTo("DEVELOPER"),
    controller.uploadVerificationDoc,
    controller.submitVerification
);

router.get(
    "/me",
    authController.protect,
    authController.restrictTo("DEVELOPER"),
    controller.getVerificationMe
);

// Admin / employee routes
router.get(
    "/",
    authController.protect,
    authController.restrictTo("ADMIN", "EMPLOYEE"),
    controller.getAllVerifications
);

router.get(
    "/:id",
    authController.protect,
    authController.restrictTo("ADMIN", "EMPLOYEE"),
    controller.getVerificationById
);

router.patch(
    "/:id/approve",
    authController.protect,
    authController.restrictTo("ADMIN", "EMPLOYEE"),
    controller.approveVerification
);

router.patch(
    "/:id/reject",
    authController.protect,
    authController.restrictTo("ADMIN", "EMPLOYEE"),
    controller.rejectVerification
);

module.exports = router;
