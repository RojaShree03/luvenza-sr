const Product = require('../models/product');
const mongoose = require('mongoose');

// Allowed product fields
const productFields = [
    'productName',
    'rating',
    'reviewCount',
    'pricing',
    'shortContent',
    'features',
    'availableSizes',
    'initialQuantity',
    'longDescription'
];

// 1. GET ALL PRODUCTS
const getAllProducts = async (req, res) => {
    try {
        const products = await Product.find();

        return res.status(200).json({
            success: true,
            count: products.length,
            products
        });

    } catch (error) {
        console.error('Get Products Error:', error);

        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// 2. GET PRODUCT BY ID
const getProductById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid product ID'
            });
        }

        const product = await Product.findById(id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        return res.status(200).json({
            success: true,
            product
        });

    } catch (error) {
        console.error('Get Product Error:', error);

        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// 3. CREATE NEW PRODUCT
const createProduct = async (req, res) => {
    try {
        const productData = {};

        // Accept only permitted product fields
        productFields.forEach(field => {
            if (req.body[field] !== undefined) {
                productData[field] = req.body[field];
            }
        });

        const newProduct = await Product.create(productData);

        return res.status(201).json({
            success: true,
            message: 'Product created successfully',
            product: newProduct
        });

    } catch (error) {
        console.error('Create Product Error:', error);

        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }

        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// 4. UPDATE ENTIRE PRODUCT
const updateProduct = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid product ID'
            });
        }

        const product = await Product.findById(id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Replace product fields with new values
        productFields.forEach(field => {
            if (req.body[field] !== undefined) {
                product[field] = req.body[field];
            }
        });

        await product.save();

        return res.status(200).json({
            success: true,
            message: 'Product updated successfully',
            product
        });

    } catch (error) {
        console.error('Update Product Error:', error);

        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }

        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// 5. PATCH PRODUCT
const patchProduct = async (req, res) => {
    try {
        const { id } = req.params;

        // Validate product ID
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid product ID'
            });
        }

        // Find existing product
        const product = await Product.findById(id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        // Allow only predefined product fields
        const allowedFields = [
            'productName',
            'rating',
            'reviewCount',
            'pricing',
            'shortContent',
            'features',
            'availableSizes',
            'initialQuantity',
            'longDescription'
        ];

        const updates = Object.keys(req.body);

        // Reject unknown fields
        const invalidFields = updates.filter(
            field => !allowedFields.includes(field)
        );

        if (invalidFields.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid fields',
                invalidFields
            });
        }

        // Apply only provided fields
        updates.forEach(field => {
            if (field === 'pricing') {
                product.pricing = {
                    ...product.pricing.toObject(),
                    ...req.body.pricing
                };
            } else {
                product[field] = req.body[field];
            }
        });

        // Save updated product
        await product.save();

        return res.status(200).json({
            success: true,
            message: 'Product updated successfully',
            product
        });

    } catch (error) {
        console.error('Patch Product Error:', error);

        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }

        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// 6. DELETE PRODUCT
const deleteProduct = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid product ID'
            });
        }

        const product = await Product.findByIdAndDelete(id);

        if (!product) {
            return res.status(404).json({
                success: false,
                message: 'Product not found'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Product deleted successfully'
        });

    } catch (error) {
        console.error('Delete Product Error:', error);

        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};


module.exports = {
    getAllProducts,
    getProductById,
    createProduct,
    updateProduct,
    patchProduct,
    deleteProduct
};