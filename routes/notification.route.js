// const authController = require("../controller/auth.controller");
const router = require( "express" ).Router()
const { createNotification,getAllNotificationByUser,deleteNotification,updateNotification } = require( "../controller/notification.controller" );

// by manakhly
router.route("/").post(createNotification)
router.route("/:id").get(getAllNotificationByUser)
router.route("/:id").delete(deleteNotification)
router.route("/:id").patch(updateNotification)


module.exports = router;
