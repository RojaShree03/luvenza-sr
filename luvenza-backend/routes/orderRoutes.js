const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const { getMyOrders } = require('../controllers/customerOrderController');

const router = express.Router();
router.get('/', authMiddleware, authorizeRoles('customer'), getMyOrders);

module.exports = router;
