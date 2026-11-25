const mongoose = require('mongoose');

const personalDetailsSchema = new mongoose.Schema({
    dateOfBirth: {
        type: Date,
        validate: {
            validator: value => !value || value <= new Date(),
            message: 'Date of birth cannot be in the future'
        }
    },
    gender: {
        type: String,
        trim: true,
        maxlength: 50
    },
    alternatePhone: {
        type: String,
        trim: true,
        maxlength: 20
    }
}, { _id: false, strict: false });

const addressSchema = new mongoose.Schema({
    addressLine1: { type: String, trim: true, maxlength: 200 },
    addressLine2: { type: String, trim: true, maxlength: 200 },
    landmark: { type: String, trim: true, maxlength: 200 },
    city: { type: String, trim: true, maxlength: 100 },
    state: { type: String, trim: true, maxlength: 100 },
    postalCode: { type: String, trim: true, maxlength: 20 },
    country: { type: String, trim: true, maxlength: 100 }
}, { _id: false, strict: false });

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, "Name is required"],
        trim: true,
        minlength: [1, 'Name cannot be empty'],
        maxlength: [100, 'Name cannot exceed 100 characters']
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

    profileCompleted: {
        type: Boolean,
        default: false
    },

    personalDetails: {
        type: personalDetailsSchema,
        default: () => ({})
    },

    address: {
        type: addressSchema,
        default: () => ({})
    },

    isActive: {
        type: Boolean,
        default: true
    },

    isApproved: {
        type: Boolean,
        default: false
    },

    professionalDetails: {
        specialization: String,
        experience: Number,
        portfolio: [String]
    },

    deliveryDetails: {
        vehicleType: String,
        vehicleNumber: String,
        licenseNumber: String
    },
    resetPasswordOTPBlockedUntil: {
        type: Date,
        default: null
    }

}, { timestamps: true });

userSchema.set('toJSON', {
    transform: (_document, returned) => {
        delete returned.password;
        delete returned.resetPasswordOTP;
        delete returned.resetPasswordOTPExpiry;
        delete returned.resetPasswordOTPAttempts;
        delete returned.resetPasswordOTPBlockedUntil;
        return returned;
    }
});

const User = mongoose.model('User', userSchema);

module.exports = User;
