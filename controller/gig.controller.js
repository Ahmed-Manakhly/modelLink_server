const createError = require( "../utils/createError" );
const Gig = require( "../models/gig.model" );
const createGig = async ( req , res , next  ) =>{

    if( ! req.isSeller ) return next(createError( 403 , "only sellers can create the gig" )) ;
    const newgig  = new Gig( {
        ...req.body , 
        user : req.userId
    } ) ;

    try{
        const saved = await newgig.save()
        res.status( 201 ). json( saved  )

    }catch(err){
        console.log( "createGig()" , err );
        next(err);
    }
    
};
const deleteGig = async( req , res , next  ) =>{
    try {
        const gigId = req.params.id
        const gig = await Gig.findById( gigId )
        if ( gig.user.toString() !== req.userId.toString() ) return next( createError( 403 , "Not authorised to delete this gig " ) )
        await Gig.findByIdAndDelete( req.params.id );
        res.status( 200 ).send(gigId)
    } catch (error) {
        console.log( "deleteGig()" , error );
        next( error );
    }

};
const getGig = async( req , res , next  ) =>{
    const gigId = req.params.id 
    try{
        const gig = await Gig.findById( gigId ).populate( "user"  );
        if ( !gig ) return next( createError( 404 , 'not found' ) );
        res.status( 200  ).send( gig )
    }
    catch( err ){
        console.log( "getGig()" , err );
        next( err );
    }

};
const getGigs = async( req , res , next  ) =>{

    const query = req.query
    const filter = {};
    if ( "userId" in query ){
        filter["user"] = query.userId
    }
    if ( "category" in query ){
        filter["category"] = {$regex : query.category , $options:"i"}
    }
    if ( "minprice" in query ){
        const pre = filter["price"]
        filter["price"] = {
            ...pre ,
            $gt: query.minprice
        }
    }
    if ( "maxprice" in query ){
        const pre = filter["price"];
        filter["price"] = {
            ...pre , 
            $lt : query.maxprice
        }
    }
    if ( "search" in query ){
        filter["$or"] = [{title:{$regex : query.search , $options:"i"}} , { features :
            {$regex : query.search , $options:"i"}
         }]
    };
    if ( "delivery" in query ){
        filter["deliveryTime"] = query.delivery
    }

    try {
        const gigs = await Gig.find( filter ).populate( "user" , { username:1 , img:1  } );
        
        res.status ( 200 ).send( gigs );

    } catch (error) {
        console.log( "gigGigs()" , error )
        next( error );
    }

}

// const dummy = async ( req , res, next ) =>{
//     console.log( "came here" )
// try {
//     const data = await Gig.find({  user : "6490810c976cba604a4f7832" })
//     res.send( data )}
    
//  catch (error) {
//     console.log( error )
//     next(error)
// }}

module.exports = { createGig , deleteGig , getGig , getGigs  } ; 
