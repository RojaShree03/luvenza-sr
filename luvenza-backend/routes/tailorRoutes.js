const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');
const tailor = require('../controllers/tailorController');

const router = express.Router();
router.use(authMiddleware, authorizeRoles('tailor'));
router.get('/dashboard/overview', tailor.getDashboardOverview);
router.get('/dashboard/monthly-report', tailor.getMonthlyReport);
router.get('/orders', tailor.getAssignedOrders);
router.get('/profile', tailor.getProfile);
router.put('/profile', tailor.updateProfile);
router.patch('/availability', tailor.updateAvailability);

module.exports = router;
