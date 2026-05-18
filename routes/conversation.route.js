const router = require( "express" ).Router() ; 
const { getConversations  , createConversation  , deleteConversation} = require("../controller/conversation.controller");
const { verifyToken } = require( "../middleware/jwt" ) ; 
/*
    user can create unique conversation if there isn't any conversation b/w buyer and seller 
*/


// router.get( "/" , verifyToken , getConversations ) ;
// router.get( "/:id" , verifyToken , getOneConversation );
router.get( "/:id"  , getConversations );
router.delete( "/:id"  , deleteConversation );
// router.post( "/" , verifyToken , createConversation ) ;
router.post( "/" , createConversation ) ;
// router.put( "/:id" , verifyToken , updateConversation );





module.exports = router;