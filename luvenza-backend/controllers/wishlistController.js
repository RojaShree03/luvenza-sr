const Wishlist = require('../models/wishlist');

// GET - View wishlist
const getWishlist = async (req, res) => {
    try {
        const wishlist = await Wishlist.findOne({
            userId: req.user._id
        }).populate('products.productId');

        res.status(200).json({
            success: true,
            wishlist: wishlist || { products: [] }
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


// POST - Add product to wishlist
const addToWishlist = async (req, res) => {
    try {
        const { productId } = req.body;

        if (!productId) {
            return res.status(400).json({
                message: 'Product ID is required'
            });
        }

        let wishlist = await Wishlist.findOne({
            userId: req.user._id
        });

        if (!wishlist) {
            wishlist = new Wishlist({
                userId: req.user._id,
                products: []
            });
        }

        const alreadyExists = wishlist.products.some(
            item => item.productId.toString() === productId
        );

        if (alreadyExists) {
            return res.status(409).json({
                message: 'Product already in wishlist'
            });
        }

        wishlist.products.push({ productId });

        await wishlist.save();

        res.status(201).json({
            success: true,
            message: 'Product added to wishlist'
        });

    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


// PUT - Replace wishlist product list
const updateWishlist = async (req, res) => {
    try {
        const { productIds } = req.body;

        if (!Array.isArray(productIds)) {
            return res.status(400).json({
                message: 'productIds must be an array'
            });
        }

        const uniqueIds = [...new Set(productIds.map(String))];

        const wishlist = await Wishlist.findOneAndUpdate(
            { userId: req.user._id },
            {
                $set: {
                    products: uniqueIds.map(productId => ({ productId }))
                }
            },
            { new: true, runValidators: true, upsert: true }
        );

        res.status(200).json({
            success: true,
            message: 'Wishlist updated',
            wishlist
        });

    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


// DELETE - Remove one product from wishlist
const removeFromWishlist = async (req, res) => {
    try {
        const wishlist = await Wishlist.findOneAndUpdate(
            { userId: req.user._id },
            {
                $pull: {
                    products: { productId: req.params.productId }
                }
            },
            { new: true }
        );

        if (!wishlist) {
            return res.status(404).json({
                message: 'Wishlist not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Product removed from wishlist',
            wishlist
        });

    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

module.exports = {
    getWishlist,
    addToWishlist,
    updateWishlist,
    removeFromWishlist
};