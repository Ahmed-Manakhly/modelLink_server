const orderController = require("../controller/order.controller");
const authController  = require("../controller/auth.controller");
const router          = require("express").Router();

router.route("/")
    .get(authController.protect, orderController.getAllOrders);

router.route("/:id")
    .get(authController.protect, orderController.getOrder)
    .delete(authController.protect, orderController.deleteOrder);

// Order lifecycle
router.post("/create-payment-intent", authController.protect, orderController.createOrderIntent);
router.patch("/:id/deliver", authController.protect, orderController.confirmOrder);
router.patch("/:id/cancel",  authController.protect, orderController.cancelOrder);
router.patch("/:id/refund",  authController.protect, authController.restrictTo("ADMIN", "EMPLOYEE"), orderController.refundOrder);

// Stripe: get clientSecret for real Stripe Elements checkout
router.get("/:id/payment-client-secret", authController.protect, orderController.getPaymentClientSecret);

// Demo: instantly fulfill a pending order without real payment
router.post("/:id/demo-checkout", authController.protect, orderController.demoCheckout);

// Stripe webhook (raw body, no auth)
router.post("/stripe-webhook", orderController.stripeWebhook);

// Asset download
router.get("/:id/assets/:assetId/download", authController.protect, orderController.downloadAsset);

module.exports = router;