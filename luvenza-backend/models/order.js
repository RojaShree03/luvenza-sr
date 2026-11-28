
const mongoose = require('mongoose');
const { ORDER_STATUSES } = require('../utils/orderStatus');

const orderItemSchema = new mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },

    productName: {
        type: String,
        required: true
    },

    quantity: {
        type: Number,
        required: true,
        min: 1
    },

    selectedSize: {
        type: String,
        required: true
    },

    unitPrice: {
        type: Number,
        required: true,
        min: 0
    },

    itemTotal: {
        type: Number,
        required: true,
        min: 0
    }
}, { _id: false });

const orderSchema = new mongoose.Schema({

    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    // Internal idempotency key used to recover interrupted checkout requests.
    checkoutKey: {
        type: String,
        select: false
    },

    items: {
        type: [orderItemSchema],
        required: true,
        validate: {
            validator: items => items.length > 0,
            message: 'An order must contain at least one item'
        }
    },

    customizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customization'
    },

    assignedTailor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },

    assignedDeliveryPartner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },

    totalAmount: {
        type: Number,
        required: true,
        min: 0
    },
    totalAmount: Number,
    payment: {
        status: {
            type: String,
            enum: ['not_started', 'pending', 'paid', 'failed'],
            default: 'not_started'
        },
        razorpayOrderId: String,
        razorpayPaymentId: String,
        verifiedAt: Date,
        webhookEventIds: [String],
        errorCode: String,
        errorDescription: String,
        activeAttemptId: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
        currency: {
            type: String,
            default: 'INR'
        }
    },
    status: {
        type: String,
        enum: [
            "placed",
            "confirmed",
            "tailoring",
            "ready_for_delivery",
            "out_for_delivery",
            "delivered",
            "cancelled"
        ],
        default: "placed"
    },
    deliveryDetails: {
        acceptedAt: Date,
        pickedUpAt: Date,
        deliveredAt: Date,
        rejectionReason: String,
        deliveryAddress: String,
        trackingNote: String
    },
    activityHistory: [
        {
            performedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User"
            },
            role: String,
            action: String,
            description: String,
            createdAt: {
                type: Date,
                default: Date.now
            }
        }
    ]
}, { timestamps: true });

module.exports = mongoose.model('Orders', orderSchema);
