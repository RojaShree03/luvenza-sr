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
    }
}, { timestamps: true });

module.exports = mongoose.model('Orders', orderSchema);