const mongoose = require( "mongoose" );
const { Schema } = mongoose;

const messageSchema = new Schema(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref:"User"
        }, 
        desc:{
            type:String ,
            required: true ,
        },
        conversation:{
            type:String
        }
    }, {
        timestamps:true
    }
)

module.exports =  mongoose.model ( "Message" , messageSchema )