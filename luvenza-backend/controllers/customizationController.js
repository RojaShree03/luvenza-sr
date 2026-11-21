const Customization = require('../models/customization');
const Measurement = require('../models/measurement');
const Product = require('../models/product');

// GET - View all customizations
const getCustomizations = async (req, res) => {
    try {
        const customizations = await Customization.find({
            userId: req.user._id
        })
            .populate('productId')
            .populate('measurementId');

        res.status(200).json({
            success: true,
            count: customizations.length,
            customizations
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


// GET - View one customization
const getCustomizationById = async (req, res) => {
    try {
        const customization = await Customization.findOne({
            _id: req.params.id,
            userId: req.user._id
        })
            .populate('productId')
            .populate('measurementId');

        if (!customization) {
            return res.status(404).json({
                message: 'Customization not found'
            });
        }

        res.status(200).json({
            success: true,
            customization
        });

    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


// POST - Save a new customization
const createCustomization = async (req, res) => {
    try {
        const {
            productId,
            measurementId,
            customizationName,
            designOptions,
            previewImage
        } = req.body;

        if (!productId || !measurementId || !customizationName) {
            return res.status(400).json({
                message: 'Product, measurement and customization name are required'
            });
        }

        // Check whether the product exists
        const product = await Product.findById(productId);

        if (!product) {
            return res.status(404).json({
                message: 'Product not found'
            });
        }

        // Ensure the measurement belongs to this user
        const measurement = await Measurement.findOne({
            _id: measurementId,
            userId: req.user._id
        });

        if (!measurement) {
            return res.status(404).json({
                message: 'Measurement profile not found'
            });
        }

        const customization = await Customization.create({
            userId: req.user._id,
            productId,
            measurementId,
            customizationName,
            designOptions,
            previewImage
        });

        res.status(201).json({
            success: true,
            message: 'Customization saved successfully',
            customization
        });

    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


// PUT - Update a customization
const updateCustomization = async (req, res) => {
    try {
        const allowedFields = [
            'measurementId',
            'customizationName',
            'designOptions',
            'previewImage',
            'status'
        ];

        const invalidFields = Object.keys(req.body).filter(
            field => !allowedFields.includes(field)
        );

        if (invalidFields.length) {
            return res.status(400).json({
                message: 'Invalid fields',
                invalidFields
            });
        }

        const customization = await Customization.findOne({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!customization) {
            return res.status(404).json({
                message: 'Customization not found'
            });
        }

        if (req.body.measurementId) {
            const measurement = await Measurement.findOne({
                _id: req.body.measurementId,
                userId: req.user._id
            });

            if (!measurement) {
                return res.status(404).json({
                    message: 'Measurement profile not found'
                });
            }
        }

        if (req.body.measurementId !== undefined) {
            customization.measurementId = req.body.measurementId;
        }

        if (req.body.customizationName !== undefined) {
            customization.customizationName = req.body.customizationName;
        }

        if (req.body.designOptions !== undefined) {
            customization.designOptions = {
                ...customization.designOptions,
                ...req.body.designOptions
            };
        }

        if (req.body.previewImage !== undefined) {
            customization.previewImage = req.body.previewImage;
        }

        if (req.body.status !== undefined) {
            customization.status = req.body.status;
        }

        await customization.save();

        res.status(200).json({
            success: true,
            message: 'Customization updated successfully',
            customization
        });

    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


// DELETE - Delete a customization
const deleteCustomization = async (req, res) => {
    try {
        const customization = await Customization.findOneAndDelete({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!customization) {
            return res.status(404).json({
                message: 'Customization not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Customization deleted successfully'
        });

    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

module.exports = {
    getCustomizations,
    getCustomizationById,
    createCustomization,
    updateCustomization,
    deleteCustomization
};