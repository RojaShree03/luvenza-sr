
const mongoose = require("mongoose");

const customizationSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true
        },

        measurementId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Measurement",
            required: true
        },

        customizationName: {
            type: String,
            required: true
        },

        designOptions: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        },

        previewImage: {
            type: String
        },

        referenceImages: [String],

        status: {
            type: String,
            enum: [
                "pending_review",
                "suggested",
                "awaiting_customer_confirmation",
                "customer_confirmed",
                "approved",
                "rejected",
                "tailor_assigned",
                "in_progress",
                "completed"
            ],
            default: "pending_review"
        },

        designerReview: {
            notes: String,
            suggestedFabric: String,
            suggestedDesign: String,
            estimatedCost: Number,
            estimatedDeliveryDate: Date,
            reviewedAt: Date
        },

        assignedTailor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model('Customization', customizationSchema);
