const router = require("express").Router();
const controller = require("../controller/wallet.controller");
const authController = require("../controller/auth.controller");

router.get(
    "/me",
    authController.protect,
    controller.getWalletMe
);

router.get(
    "/transactions",
    authController.protect,
    controller.getWalletTransactions
);

module.exports = router;
