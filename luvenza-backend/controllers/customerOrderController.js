const Order = require('../models/order');

const getMyOrders = async (req, res) => {
    try {
        const orders = await Order.find({ customerId: req.user._id })
            .populate('customizationId', 'customizationName status')
            .sort({ createdAt: -1 });
        res.status(200).json({ count: orders.length, orders });
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch your orders', error: error.message });
    }
};

module.exports = { getMyOrders };
