const authController = require("../controller/auth.controller");
const router = require( "express" ).Router()
const { createNotification,getAllNotificationByUser,deleteNotification,updateNotification, readAllNotifications } = require( "../controller/notification.controller" );

router.route("/read-all").patch(authController.protect, readAllNotifications);
router.route("/").post(authController.protect, authController.restrictTo('CLIENT', 'DEVELOPER', 'ADMIN'), createNotification);
router.route("/:id")
    .get(authController.protect, getAllNotificationByUser)
    .delete(authController.protect, deleteNotification)
    .patch(authController.protect, updateNotification);

module.exports = router;
