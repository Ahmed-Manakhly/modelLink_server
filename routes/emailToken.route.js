const router = require( "express" ).Router() ; 
const { createEmailToken ,verifyEmailToken  } = require("../controller/emailToken.controller");



router.post( "/"  , createEmailToken );
router.get( "/"  , verifyEmailToken );


module.exports = router;