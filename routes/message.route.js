const router = require( "express" ).Router();
const { getMessages, createMessage } = require("../controller/message.controller");
const { verifyToken } = require( "../middleware/jwt" );

// router.get( "/:id" , verifyToken , getMessages   )
// router.post( "/" , verifyToken , createMessage   )
router.get( "/:id"  , getMessages   )
router.post( "/"  , createMessage   )

module.exports = router;