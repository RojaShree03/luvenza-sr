const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    customizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Customization"
    },
    assignedTailor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    assignedDeliveryPartner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
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
