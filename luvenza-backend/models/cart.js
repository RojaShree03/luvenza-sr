const mongoose = require('mongoose');

const checkoutSchema = new mongoose.Schema({
    key: { type: String, required: true },
    state: {
        type: String,
        enum: ['processing', 'committed'],
        default: 'processing',
        required: true
    },
    processingToken: { type: String, required: true },
    leaseExpiresAt: { type: Date, required: true },
    committedOrderId: { type: mongoose.Schema.Types.ObjectId },
    committedItems: [{
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        productName: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1 },
        selectedSize: { type: String, required: true },
        unitPrice: { type: Number, required: true, min: 0 },
        itemTotal: { type: Number, required: true, min: 0 }
    }],
    committedTotalAmount: { type: Number, min: 0 },
    items: [{
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },
        quantity: { type: Number, required: true, min: 1 },
        selectedSize: { type: String, required: true }
    }]
}, { _id: false });

const cartSchema = new mongoose.Schema({

    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },

    items: [{
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true
        },

        quantity: {
            type: Number,
            default: 1,
            min: 1
        },

        selectedSize: {
            type: String,
            required: true
        }
    }],

    // Durable checkout claim. Kept private from normal cart API responses.
    checkout: { type: checkoutSchema, select: false }

}, { timestamps: true, optimisticConcurrency: true });

module.exports = mongoose.model('Cart', cartSchema);
