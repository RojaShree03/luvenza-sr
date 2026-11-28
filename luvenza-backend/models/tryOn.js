const mongoose = require('mongoose');

const generatedPreviewSchema = new mongoose.Schema(
    {
        designConfiguration: {
            type: mongoose.Schema.Types.Mixed,
            required: true
        },

        previewImage: {
            type: String,
            required: true
        },

        generatedAt: {
            type: Date,
            default: Date.now
        }
    },
    {
        _id: true
    }
);

const tryOnSchema = new mongoose.Schema(
    {
        customerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },

        customizationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Customization',
            required: true
        },

        generationCount: {
            type: Number,
            default: 0,
            min: 0
        },

        maxGenerations: {
            type: Number,
            default: 3
        },

        generatedPreviews: {
            type: [generatedPreviewSchema],
            default: []
        }
    },
    {
        timestamps: true
    }
);

tryOnSchema.index(
    { customerId: 1, customizationId: 1 },
    { unique: true }
);

const TryOn = mongoose.model('TryOn', tryOnSchema);

module.exports = TryOn;