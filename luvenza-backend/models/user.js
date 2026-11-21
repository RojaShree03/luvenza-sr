const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Name is required"],
        trim: true
    },
    email: {
        type: String,
        required: [true, "Email is required"],
        unique: true,
        lowercase: true,
        trim: true
    },
    phone: {
        type: String,
        required: [true, "Phone Number is required"],
        trim: true
    },
    password: {
        type: String,
        required: [true, "Password id required"],
        minlength: 8
    },
    role: {
        type: String,
        enum: ["customer", "admin", "tailor", "deliver_partner"],
        default: "customer"
    },
    resetPasswordOTP: {
        type: String,
        default: null
    },
    resetPasswordOTPExpiry: {
        type: Date,
        default: null
    }, resetPasswordOTPAttempts: {
        type: Number,
        default: 0
    },
    resetPasswordOTPBlockedUntil: {
        type: Date,
        default: null
    }

}, { timestamps: true });

const User = mongoose.model('User', userSchema);

module.exports = User;