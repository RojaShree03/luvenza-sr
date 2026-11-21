const User = require("../models/user");
const Product = require("../models/product");
const Order = require("../models/order");
const Customization = require("../models/customization");

// GET /api/admin/dashboard/overview
exports.getOverview = async (req, res) => {
    try {
        const [
            totalCustomers,
            totalTailors,
            totalDeliveryPartners,
            totalProducts,
            totalOrders,
            pendingRequests,
            activeOrders
        ] = await Promise.all([
            User.countDocuments({ role: "customer" }),
            User.countDocuments({ role: "tailor" }),
            User.countDocuments({ role: "deliver_partner" }),
            Product.countDocuments(),
            Order.countDocuments(),
            Customization.countDocuments({
                status: "pending_review"
            }),
            Order.countDocuments({
                status: {
                    $in: [
                        "placed",
                        "confirmed",
                        "tailoring",
                        "ready_for_delivery",
                        "out_for_delivery"
                    ]
                }
            })
        ]);

        const salesResult = await Order.aggregate([
            { $match: { status: { $ne: "cancelled" } } },
            {
                $group: {
                    _id: null,
                    totalSales: { $sum: "$totalAmount" }
                }
            }
        ]);

        res.status(200).json({
            overview: {
                totalCustomers,
                totalTailors,
                totalDeliveryPartners,
                totalProducts,
                totalOrders,
                pendingRequests,
                activeOrders,
                totalSales: salesResult[0]?.totalSales || 0
            }
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


// GET /api/admin/dashboard/sales
exports.getSalesReport = async (req, res) => {
    try {
        const sales = await Order.aggregate([
            {
                $match: {
                    status: { $ne: "cancelled" }
                }
            },
            {
                $group: {
                    _id: {
                        year: { $year: "$createdAt" },
                        month: { $month: "$createdAt" }
                    },
                    totalSales: { $sum: "$totalAmount" },
                    totalOrders: { $sum: 1 }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
        ]);

        res.status(200).json({ sales });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


// GET /api/admin/dashboard/orders
exports.getOrderReport = async (req, res) => {
    try {
        const orders = await Order.aggregate([
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 }
                }
            }
        ]);

        res.status(200).json({ orders });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


// GET /api/admin/dashboard/customers
exports.getCustomerReport = async (req, res) => {
    try {
        const customers = await User.aggregate([
            { $match: { role: "customer" } },
            {
                $group: {
                    _id: "$isActive",
                    count: { $sum: 1 }
                }
            }
        ]);

        res.status(200).json({ customers });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


// GET /api/admin/dashboard/products
exports.getProductReport = async (req, res) => {
    try {
        const products = await Product.countDocuments();

        res.status(200).json({
            totalProducts: products
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};