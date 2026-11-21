const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const tailor = require("../controllers/adminTailorController");
const delivery = require("../controllers/adminDeliveryController");
const order = require("../controllers/adminOrderController");
const customization = require("../controllers/adminCustomizationController");
const category = require("../controllers/categoryController");
const dashboard = require("../controllers/adminDashboardController");

// All routes in this file are Admin-only.
router.use(authMiddleware, authorizeRoles("admin"));

// TAILOR MANAGEMENT
router.get("/tailors", tailor.getTailors);
router.get("/tailors/:id", tailor.getTailorById);
router.put("/tailors/:id", tailor.updateTailor);
router.patch("/tailors/:id/status", tailor.updateTailorStatus);

// DELIVERY PARTNER MANAGEMENT
router.get("/delivery-partners", delivery.getDeliveryPartners);
router.get("/delivery-partners/:id", delivery.getDeliveryPartnerById);
router.put("/delivery-partners/:id", delivery.updateDeliveryPartner);
router.patch("/delivery-partners/:id/status", delivery.updateDeliveryStatus);

// ORDER MANAGEMENT
router.get("/orders", order.getOrders);
router.get("/orders/:id", order.getOrderById);
router.patch("/orders/:id/status", order.updateOrderStatus);
router.patch("/orders/:id/assign-tailor", order.assignTailor);
router.patch("/orders/:id/assign-delivery", order.assignDeliveryPartner);
router.patch("/orders/:id/cancel", order.cancelOrder);

// CUSTOMIZATION MANAGEMENT
router.get("/customizations", customization.getAllCustomizations);
router.get("/customizations/:id", customization.getCustomizationById);
router.patch(
    "/customizations/:id/status",
    customization.updateCustomizationStatus
);
router.delete("/customizations/:id", customization.deleteCustomization);

// CATEGORY MANAGEMENT
router.post("/categories", category.createCategory);
router.get("/categories", category.getCategories);
router.get("/categories/:id", category.getCategoryById);
router.put("/categories/:id", category.updateCategory);
router.delete("/categories/:id", category.deleteCategory);

// DASHBOARD AND REPORTS
router.get("/dashboard/overview", dashboard.getOverview);
router.get("/dashboard/sales", dashboard.getSalesReport);
router.get("/dashboard/orders", dashboard.getOrderReport);
router.get("/dashboard/customers", dashboard.getCustomerReport);
router.get("/dashboard/products", dashboard.getProductReport);

module.exports = router;