const mongoose = require('mongoose');

const customizationSchema = new mongoose.Schema({

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },

    measurementId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Measurement',
        required: true
    },

    customizationName: {
        type: String,
        required: true
    },

    designOptions: {
        fabric: String,
        color: String,
        sleeveStyle: String,
        neckStyle: String,
        pattern: String,
        dressLength: Number,
        additionalInstructions: String
    },

    previewImage: {
        type: String,
        default: ''
    },

    status: {
        type: String,
        enum: ['draft', 'saved', 'ordered'],
        default: 'draft'
    }

}, { timestamps: true });

module.exports = mongoose.model('Customization', customizationSchema);