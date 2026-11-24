const Cart = require('../models/cart');
const Order = require('../models/order');
const mongoose = require('mongoose');

// POST - Place order
const placeOrder = async (req, res) => {
    try {

        // 1. Get customer's cart
        const cart = await Cart.findOne({
            userId: req.user._id
        }).populate('items.productId');

        if (!cart || cart.items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Your cart is empty'
            });
        }

        // 2. Validate cart items and calculate total
        const orderItems = [];
        let totalAmount = 0;

        for (const item of cart.items) {

            const product = item.productId;

            // Check whether product exists
            if (!product) {
                return res.status(400).json({
                    success: false,
                    message: 'One or more products are no longer available'
                });
            }

            // Check available size
            if (!product.availableSizes.includes(item.selectedSize)) {
                return res.status(400).json({
                    success: false,
                    message: `${product.productName} is not available in size ${item.selectedSize}`
                });
            }

            // Get price from database
            const unitPrice = product.pricing.newPrice;

            if (!Number.isFinite(unitPrice) || unitPrice < 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid product price'
                });
            }

            const itemTotal = unitPrice * item.quantity;

            orderItems.push({
                productId: product._id,
                productName: product.productName,
                quantity: item.quantity,
                selectedSize: item.selectedSize,
                unitPrice,
                itemTotal
            });

            totalAmount += itemTotal;
        }

        // 3. Create order
        const order = await Order.create({
            customerId: req.user._id,
            items: orderItems,
            totalAmount,
            status: 'Pending'
        });

        // 4. Clear customer's cart
        cart.items = [];
        await cart.save();

        // 5. Send response
        res.status(201).json({
            success: true,
            message: 'Order placed successfully',
            order
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


// GET - Customer order history
const getMyOrders = async (req, res) => {
    try {
        const orders = await Order.find({
            customerId: req.user._id
        }).sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: orders.length,
            orders
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


const getOrderById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid order ID'
            });
        }

        const order = await Order.findOne({
            _id: id,
            customerId: req.user._id
        });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        res.status(200).json({
            success: true,
            order
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// cancel order
const cancelOrder = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid order ID'
            });
        }

        const order = await Order.findOne({
            _id: id,
            customerId: req.user._id
        });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        const allowedStatuses = [
            'Pending',
            'Awaiting_Approval'
        ];

        if (!allowedStatuses.includes(order.status)) {
            return res.status(400).json({
                success: false,
                message: 'This order cannot be cancelled'
            });
        }

        order.status = 'Cancelled';
        await order.save();

        res.status(200).json({
            success: true,
            message: 'Order cancelled successfully',
            order
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

module.exports = {
    placeOrder,
    getMyOrders,
    getOrderById, 
    cancelOrder
};