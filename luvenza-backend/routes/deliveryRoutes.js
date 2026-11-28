
const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const {
    getAssignedDeliveries,
    getDeliveryById,
    acceptDelivery,
    rejectDelivery,
    updateDeliveryStatus,
    updateAvailability,
    getDeliveryProfile,
    updateDeliveryProfile,
    getDashboardOverview,
    getDeliveryStatistics,
    getPerformanceReport,
    getRecentActivity,
    getMonthlyReport
} = require("../controllers/deliveryController");

// Protect every delivery partner route
router.use(authMiddleware);
router.use(authorizeRoles("deliver_partner"));

// Dashboard and reports
router.get("/dashboard/overview", getDashboardOverview);
router.get("/dashboard/orders", getDeliveryStatistics);
router.get("/dashboard/performance", getPerformanceReport);
router.get("/dashboard/recent-activity", getRecentActivity);
router.get("/dashboard/monthly-report", getMonthlyReport);

// Profile
router.get("/profile", getDeliveryProfile);
router.put("/profile", updateDeliveryProfile);

// Availability
router.patch("/availability", updateAvailability);

// Assigned deliveries
router.get("/orders", getAssignedDeliveries);
router.get("/orders/:id", getDeliveryById);
router.patch("/orders/:id/accept", acceptDelivery);
router.patch("/orders/:id/reject", rejectDelivery);
router.patch("/orders/:id/status", updateDeliveryStatus);

module.exports = router;