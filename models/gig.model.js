const { default: mongoose } = require("mongoose");

const { Schema } = mongoose;
const GigSchema = new Schema({
    user:{
        type:Schema.Types.ObjectId,
        require:true,
        ref : "User"
    },
    title:{
        type:String,
        requried: true ,
    },
    desc:{
        type:String , 
        required: true,
    },
    totalStars:{
        type:Number,
        default:0
    }, 
    starFrequency:{
        type:Number,
        default:0,
    },
    category:{
        type:String , 
        required:true,
    },
    price:{
        type:Number,
        required:true
    },
    cover:{
        type:String , 
        required:true
    },
    images:{
        type:[String],
    },
    deliveryTime:{
        type:Number, 
        required:true
    },
    revisionNumber:{
        type:Number, 
        required:true
    }, 
    features:{
        type:[String],
    },
    sales:{
        type:Number,
        default:0
    },
},{
    timestamps:true
})

module.exports =  mongoose.model( "Gig" , GigSchema )