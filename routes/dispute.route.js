const router = require("express").Router();
const controller = require("../controller/dispute.controller");
const authController = require("../controller/auth.controller");

router.post(
    "/",
    authController.protect,
    authController.restrictTo("CLIENT"),
    controller.createDispute
);

router.get(
    "/",
    authController.protect,
    controller.getDisputes
);

router.patch(
    "/:id/resolve",
    authController.protect,
    authController.restrictTo("ADMIN", "EMPLOYEE"),
    controller.resolveDispute
);

module.exports = router;
