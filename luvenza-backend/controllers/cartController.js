const Cart = require('../models/cart');
const { recoverExpiredCheckoutForUser } = require('./orderController');

const respondCartMutationError = (res, error) => {
    if (error.name === 'VersionError' || error.code === 11000) {
        return res.status(409).json({
            success: false,
            message: 'Cart changed or checkout is in progress. Please try again.'
        });
    }
    return res.status(400).json({ message: error.message });
};

const checkoutInProgress = (res) => res.status(409).json({
    success: false,
    message: 'Checkout is in progress. Please retry this cart change later.'
});

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
        }).select('+checkout');

        if (cart?.checkout?.key) {
            const recovered = await recoverExpiredCheckoutForUser(req.user._id);
            if (!recovered) return checkoutInProgress(res);
            cart = await Cart.findOne({ userId: req.user._id }).select('+checkout');
        }

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
        respondCartMutationError(res, error);
    }
};


// PUT - Update cart item quantity or size
const updateCartItem = async (req, res) => {
    try {
        const { quantity, selectedSize } = req.body;

        let cart = await Cart.findOne({
            userId: req.user._id
        }).select('+checkout');

        if (!cart) {
            return res.status(404).json({
                message: 'Cart not found'
            });
        }

        if (cart.checkout?.key) {
            const recovered = await recoverExpiredCheckoutForUser(req.user._id);
            if (!recovered) return checkoutInProgress(res);
            cart = await Cart.findOne({ userId: req.user._id }).select('+checkout');
            if (!cart) return res.status(404).json({ message: 'Cart not found' });
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
        respondCartMutationError(res, error);
    }
};


// DELETE - Remove cart item
const removeCartItem = async (req, res) => {
    try {
        let cart = await Cart.findOne({
            userId: req.user._id
        }).select('+checkout');

        if (!cart) {
            return res.status(404).json({
                message: 'Cart not found'
            });
        }

        if (cart.checkout?.key) {
            const recovered = await recoverExpiredCheckoutForUser(req.user._id);
            if (!recovered) return checkoutInProgress(res);
            cart = await Cart.findOne({ userId: req.user._id }).select('+checkout');
            if (!cart) return res.status(404).json({ message: 'Cart not found' });
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
        respondCartMutationError(res, error);
    }
};

module.exports = {
    getCart,
    addToCart,
    updateCartItem,
    removeCartItem
};
