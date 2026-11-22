const mongoose = require("mongoose");

const templateSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    description: String,
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category"
    },
    image: String,
    basePrice: {
        type: Number,
        required: true,
        min: 0
    },
    availableSizes: [String],
    designOptions: {
        fabric: [String],
        colors: [String],
        sleeveStyles: [String],
        neckStyles: [String],
        patterns: [String]
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

module.exports = mongoose.model("Template", templateSchema);