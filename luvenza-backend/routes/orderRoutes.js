const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

const {
    placeOrder,
    getMyOrders,
    getOrderById,
    cancelOrder
} = require('../controllers/orderController');

router.post('/', authMiddleware, authorizeRoles('customer'), placeOrder);
router.get('/my-orders', authMiddleware, getMyOrders);
router.get('/:id', authMiddleware, getOrderById);
router.put('/:id/cancel', authMiddleware, cancelOrder);

module.exports = router;
