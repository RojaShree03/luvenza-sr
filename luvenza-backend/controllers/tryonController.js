
const mongoose = require('mongoose');
const fs = require('fs/promises');

const Customization = require('../models/Customization');
const TryOn = require('../models/tryOn');

const MAX_GENERATIONS = 3;

// POST: Save a 3D outfit preview
const generateTryOn = async (req, res) => {
    let uploadedFilePath = null;
    let previewSaved = false;

    try {
        const customerId = req.user._id;
        const { customizationId } = req.body;

        // 1. Validate customization ID
        if (!mongoose.Types.ObjectId.isValid(customizationId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid customization ID'
            });
        }

        // 2. Check uploaded preview image
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Preview image is required'
            });
        }

        uploadedFilePath = req.file.path;

        // 3. Parse design configuration
        let designConfiguration;

        try {
            designConfiguration =
                typeof req.body.designConfiguration === 'string'
                    ? JSON.parse(req.body.designConfiguration)
                    : req.body.designConfiguration;
        } catch (error) {
            return res.status(400).json({
                success: false,
                message: 'Invalid design configuration JSON'
            });
        }

        if (
            !designConfiguration ||
            typeof designConfiguration !== 'object' ||
            Array.isArray(designConfiguration)
        ) {
            return res.status(400).json({
                success: false,
                message: 'Valid design configuration is required'
            });
        }

        // 4. Verify customization ownership
        const customization = await Customization.findOne({
            _id: customizationId,
            customerId
        });

        if (!customization) {
            return res.status(404).json({
                success: false,
                message: 'Customization not found'
            });
        }

        // 5. Check preview eligibility
        if (!customization.isPreviewEligible) {
            return res.status(403).json({
                success: false,
                message: 'This customization is not eligible for preview'
            });
        }

        // 6. Create or retrieve TryOn record
        try {
            await TryOn.findOneAndUpdate(
                { customerId, customizationId },
                {
                    $setOnInsert: {
                        customerId,
                        customizationId,
                        generationCount: 0,
                        generatedPreviews: []
                    }
                },
                {
                    upsert: true,
                    new: true,
                    setDefaultsOnInsert: true
                }
            );
        } catch (error) {
            // Another simultaneous request may have created the record.
            if (error.code !== 11000) {
                throw error;
            }
        }

        // 7. Prepare image path
        const previewImage = `uploads/tryon/${req.file.filename}`;

        // 8. Atomically save preview and increase count
        const updatedTryOn = await TryOn.findOneAndUpdate(
            {
                customerId,
                customizationId,
                generationCount: { $lt: MAX_GENERATIONS }
            },
            {
                $inc: { generationCount: 1 },
                $push: {
                    generatedPreviews: {
                        designConfiguration,
                        previewImage,
                        generatedAt: new Date()
                    }
                }
            },
            {
                new: true,
                runValidators: true
            }
        );

        // 9. Reject if generation limit reached
        if (!updatedTryOn) {
            return res.status(403).json({
                success: false,
                message: 'Maximum preview generation limit reached',
                remainingGenerations: 0
            });
        }

        previewSaved = true;

        // 10. Send successful response
        return res.status(201).json({
            success: true,
            message: '3D outfit preview saved successfully',
            data: {
                customizationId,
                generationCount: updatedTryOn.generationCount,
                maxGenerations: MAX_GENERATIONS,
                remainingGenerations:
                    MAX_GENERATIONS - updatedTryOn.generationCount,
                preview: updatedTryOn.generatedPreviews[
                    updatedTryOn.generatedPreviews.length - 1
                ]
            }
        });

    } catch (error) {
        console.error('Try-On Controller Error:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to save outfit preview'
        });

    } finally {
        // Delete uploaded image if database saving failed
        if (uploadedFilePath && !previewSaved) {
            try {
                await fs.unlink(uploadedFilePath);
            } catch (error) {
                console.error('Temporary image cleanup failed:', error.message);
            }
        }
    }
};


const getTryOnHistory = async (req, res) => {
    try {
        const { customizationId } = req.params;
        const customerId = req.user._id;

        // 1. Validate customization ID
        if (!mongoose.Types.ObjectId.isValid(customizationId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid customization ID'
            });
        }

        // 2. Verify customization ownership
        const customization = await Customization.findOne({
            _id: customizationId,
            customerId
        });

        if (!customization) {
            return res.status(404).json({
                success: false,
                message: 'Customization not found'
            });
        }

        // 3. Find preview history
        const tryOn = await TryOn.findOne({
            customerId,
            customizationId
        });

        if (!tryOn) {
            return res.status(200).json({
                success: true,
                message: 'No preview history found',
                data: {
                    previews: [],
                    generationCount: 0,
                    maxGenerations: 3
                }
            });
        }

        // 4. Return previews in newest-first order
        const previews = [...tryOn.generatedPreviews].reverse();

        return res.status(200).json({
            success: true,
            message: 'Preview history retrieved successfully',
            data: {
                previews,
                generationCount: tryOn.generationCount,
                maxGenerations: tryOn.maxGenerations
            }
        });

    } catch (error) {
        console.error('Try-On History Error:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve preview history'
        });
    }
};


const getRemainingGenerations = async (req, res) => {
    try {
        const { customizationId } = req.params;
        const customerId = req.user._id;

        // 1. Validate customization ID
        if (!mongoose.Types.ObjectId.isValid(customizationId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid customization ID'
            });
        }

        // 2. Verify customization ownership
        const customization = await Customization.findOne({
            _id: customizationId,
            customerId
        });

        if (!customization) {
            return res.status(404).json({
                success: false,
                message: 'Customization not found'
            });
        }

        // 3. Find TryOn record
        const tryOn = await TryOn.findOne({
            customerId,
            customizationId
        });

        // 4. Calculate remaining previews
        const generationCount = tryOn
            ? tryOn.generationCount
            : 0;

        const maxGenerations = tryOn
            ? tryOn.maxGenerations
            : 3;

        const remainingGenerations = Math.max(
            0,
            maxGenerations - generationCount
        );

        return res.status(200).json({
            success: true,
            message: 'Remaining previews retrieved successfully',
            data: {
                generationCount,
                maxGenerations,
                remainingGenerations,
                canGenerate: remainingGenerations > 0
            }
        });

    } catch (error) {
        console.error('Remaining Generations Error:', error);

        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve remaining previews'
        });
    }
};


module.exports = {
    generateTryOn,
    getTryOnHistory,
    getRemainingGenerations
};