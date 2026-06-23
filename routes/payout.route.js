const router = require("express").Router();
const controller = require("../controller/payout.controller");
const authController = require("../controller/auth.controller");

// Developer-only actions
router.post(
    "/request",
    authController.protect,
    authController.restrictTo("DEVELOPER"),
    controller.requestPayout
);

router.get(
    "/me",
    authController.protect,
    authController.restrictTo("DEVELOPER"),
    controller.getMyPayouts
);

// Admin-only actions
router.get(
    "/",
    authController.protect,
    authController.restrictTo("ADMIN", "EMPLOYEE"),
    controller.getAllPayouts
);

router.patch(
    "/:id/approve",
    authController.protect,
    authController.restrictTo("ADMIN", "EMPLOYEE"),
    controller.approvePayout
);

router.patch(
    "/:id/reject",
    authController.protect,
    authController.restrictTo("ADMIN", "EMPLOYEE"),
    controller.rejectPayout
);

router.patch(
    "/:id/cancel",
    authController.protect,
    authController.restrictTo("DEVELOPER"),
    controller.cancelPayout
);

module.exports = router;
