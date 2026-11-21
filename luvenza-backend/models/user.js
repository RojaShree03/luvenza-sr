const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name:{
        type: String,
        required: [true, "Name is required"],
        trim: true
    },
    email:{
        type:String,
        required:[true,"Email is required"],
        unique:true,
        lowercase:true,
        trim: true
    },
    phone:{
        type:String,
        required:[true, "Phone Number is required"],
        trim: true
    },
    password:{
        type:String,
        required:[true,"Password id required"],
        minlength:8
    },
    role:{
        type:String,
        enum:["customer","admin","tailor","deliver_partner"]
        // default:"customer"
    },

    personalDetails: {
        firstName: String,
        lastName: String,
        dateOfBirth: Date,
        gender: String,
        profileImage: String
    },

    address: {
        street: String,
        city: String,
        state: String,
        country: String,
        pincode: String
    },

    profileCompleted: {
        type: Boolean,
        default: false
    }

},{timestamps:true});

const User = mongoose.model('User', userSchema);

module.exports = User;