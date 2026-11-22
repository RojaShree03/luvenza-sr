
const express = require("express");
const router = express.Router();

const {
    getAllCustomers,
    getCustomerById,
    updateCustomer,
    updateCustomerStatus,
    deleteCustomer
} = require("../controllers/adminCustomerController");

const authMiddleware = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

// All routes below require Admin authentication
router.use(authMiddleware);
router.use(authorizeRoles("admin"));

// Customer management routes
router.get("/", getAllCustomers);
router.get("/:id", getCustomerById);
router.put("/:id", updateCustomer);
router.patch("/:id/status", updateCustomerStatus);
router.delete("/:id", deleteCustomer);

module.exports = router;