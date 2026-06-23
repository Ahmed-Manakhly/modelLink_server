const router = require( "express" ).Router() ;
const { getConversations  , createConversation  , deleteConversation} = require("../controller/conversation.controller");
const authController = require("../controller/auth.controller");

router.use(authController.protect);

router.get( "/:id"  , getConversations );
router.delete( "/:id"  , deleteConversation );
router.post( "/" , createConversation ) ;

module.exports = router;