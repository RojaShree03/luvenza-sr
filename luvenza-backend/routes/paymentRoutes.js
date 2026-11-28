const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const { initiatePayment, verifyPayment } = require('../controllers/paymentController');

const router = express.Router();
router.post('/orders/:orderId/initiate', authMiddleware, authorizeRoles('customer'), initiatePayment);
router.post('/orders/:orderId/verify', authMiddleware, authorizeRoles('customer'), verifyPayment);

module.exports = router;
