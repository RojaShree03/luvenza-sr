const mongoose = require('mongoose');

const measurementSchema = new mongoose.Schema({

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    profileName: {
        type: String,
        required: true,
        trim: true
    },

    measurements: {
        height: Number,
        bust: Number,
        waist: Number,
        hip: Number,
        shoulder: Number,
        sleeveLength: Number,
        armhole: Number,
        dressLength: Number,
        unit: {
            type: String,
            enum: ['inches', 'cm'],
            default: 'inches'
        }
    }

}, { timestamps: true });

module.exports = mongoose.model('Measurement', measurementSchema);