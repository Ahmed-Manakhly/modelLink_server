const router = require("express").Router();
const controller = require("../controller/auditLog.controller");
const authController = require("../controller/auth.controller");

// Require admin/employee role for all administrative actions
router.use(authController.protect, authController.restrictTo("ADMIN", "EMPLOYEE"));

router.get("/audit-logs", controller.getAllAuditLogs);
router.get("/pending-counts", controller.getPendingCounts);
router.get("/settings", controller.getSettings);
router.patch("/settings", controller.updateSettings);
router.get("/transactions", controller.getAllTransactions);
router.get("/transactions/:id", controller.getTransaction);
router.get("/webhooks", controller.getAllWebhookEvents);

module.exports = router;
