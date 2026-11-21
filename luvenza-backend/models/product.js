const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({

    productName: {
        type: String,
        required: true,
        trim: true
    },

    rating: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
    },

    reviewCount: {
        type: Number,
        default: 0,
        min: 0
    },

    pricing: {
        newPrice: {
            type: Number,
            required: true
        },
        strikePrice: {
            type: Number,
            required: true
        },
        discountPercentage: {
            type: Number,
            required: true
        }
    },

    shortContent: {
        type: [String],
        required: true
    },

    features: {
        type: [String],
        required: true
    },

    availableSizes: {
        type: [String],
        required: true
    },

    initialQuantity: {
        type: Number,
        default: 1,
        min: 1
    },

    longDescription: {
        type: String,
        required: true
    }

}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);

module.exports = Product;