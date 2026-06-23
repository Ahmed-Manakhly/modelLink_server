const router = require( "express" ).Router();
const { getMessages, createMessage, uploadMessageAttachment, markMessagesAsRead } = require("../controller/message.controller");
const authController = require("../controller/auth.controller");

router.use(authController.protect);

router.get( "/:id"  , getMessages   )
router.post( "/"  , uploadMessageAttachment, createMessage   )
router.patch( "/read/:conversationId", markMessagesAsRead )

module.exports = router;