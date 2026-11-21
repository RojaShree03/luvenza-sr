const Cart = require('../models/cart');

// GET - View cart
const getCart = async (req, res) => {
    try {
        const cart = await Cart.findOne({
            userId: req.user._id
        }).populate('items.productId');

        res.status(200).json({
            success: true,
            cart: cart || { items: [] }
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


// POST - Add product to cart
const addToCart = async (req, res) => {
    try {
        const { productId, quantity, selectedSize } = req.body;

        if (!productId || !selectedSize ||
            !Number.isInteger(quantity) || quantity < 1) {
            return res.status(400).json({
                message: 'Valid productId, quantity and selectedSize are required'
            });
        }

        let cart = await Cart.findOne({
            userId: req.user._id
        });

        if (!cart) {
            cart = new Cart({
                userId: req.user._id,
                items: []
            });
        }

        const existingItem = cart.items.find(item =>
            item.productId.toString() === productId &&
            item.selectedSize === selectedSize
        );

        if (existingItem) {
            existingItem.quantity += quantity;
        } else {
            cart.items.push({
                productId,
                quantity,
                selectedSize
            });
        }

        await cart.save();

        res.status(201).json({
            success: true,
            message: 'Product added to cart',
            cart
        });

    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


// PUT - Update cart item quantity or size
const updateCartItem = async (req, res) => {
    try {
        const { quantity, selectedSize } = req.body;

        const cart = await Cart.findOne({
            userId: req.user._id
        });

        if (!cart) {
            return res.status(404).json({
                message: 'Cart not found'
            });
        }

        const item = cart.items.id(req.params.itemId);

        if (!item) {
            return res.status(404).json({
                message: 'Cart item not found'
            });
        }

        if (quantity !== undefined) {
            if (!Number.isInteger(quantity) || quantity < 1) {
                return res.status(400).json({
                    message: 'Quantity must be a positive integer'
                });
            }
            item.quantity = quantity;
        }

        if (selectedSize !== undefined) {
            item.selectedSize = selectedSize;
        }

        await cart.save();

        res.status(200).json({
            success: true,
            message: 'Cart updated',
            cart
        });

    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


// DELETE - Remove cart item
const removeCartItem = async (req, res) => {
    try {
        const cart = await Cart.findOne({
            userId: req.user._id
        });

        if (!cart) {
            return res.status(404).json({
                message: 'Cart not found'
            });
        }

        const item = cart.items.id(req.params.itemId);

        if (!item) {
            return res.status(404).json({
                message: 'Cart item not found'
            });
        }

        item.deleteOne();
        await cart.save();

        res.status(200).json({
            success: true,
            message: 'Item removed from cart'
        });

    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

module.exports = {
    getCart,
    addToCart,
    updateCartItem,
    removeCartItem
};