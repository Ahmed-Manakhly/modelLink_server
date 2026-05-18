const mongoose = require("mongoose");
const {Schema} = mongoose;

const userSchema = new Schema(
    {
        username: {
            type: String,
            required: true,
            unique: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
        },
        password: {
            type: String,
            required: true,
            select: false,
        },
        img: {
            type: String,
        },
        country: {
            type: String,
            required: true,
        },
        phone: {
            type: String,
        },
        desc: {
            type: String,
        },
        role: {
            type: String,
            enum: ['consumer', 'seller' ,'admin'],
            default: "consumer",
        },
        total_orders: {
            type: Number,
            default: 0
        },

        isActive: {
            type: Boolean,
            default: true,
        },

        numberOfFailedLoginAttempts: {
            type: Number,
            default: 0,
        },

        accountLockTimestamp: {
            type: Date,
            default: null,
        },

        passwordLastChangedTimestamp: {
            type: Date,
            default: Date.now(),
        },
    },
    {
        timestamps: true,
    }
);


module.exports = mongoose.model("User", userSchema)
