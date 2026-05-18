const router = require( "express" ).Router()
const {verifyToken} = require( "../middleware/jwt" ) ;
const { createGig , deleteGig , getGig , getGigs } = require( "../controller/gig.controller" ) ; 
// Tasks 
    // create the gig 
    // delete the gig 
    // fetch single gig
    // fetch multiple gig 



// router.get( "/dummy" , dummy )


router.post( "/"  , verifyToken ,  createGig );
router.get( "/:id" , getGig )
router.get( "/" , getGigs )
router.delete( "/:id"  , verifyToken , deleteGig );




module.exports = router;