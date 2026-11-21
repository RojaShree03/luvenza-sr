const mongoose = require("mongoose");

const designComponentSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: [
            "fabric",
            "color",
            "sleeve",
            "neck",
            "pattern",
            "embellishment",
            "other"
        ],
        required: true
    },
    image: String,
    description: String,
    additionalCost: {
        type: Number,
        default: 0,
        min: 0
    },
    isAvailable: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

module.exports = mongoose.model(
    "DesignComponent",
    designComponentSchema
);