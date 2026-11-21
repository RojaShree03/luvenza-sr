const User = require("../models/user");

// 1. Get all customers
const getAllCustomers = async (req, res) => {
    try {
        const page = Math.max(Number(req.query.page) || 1, 1);
        const limit = Math.min(
            Math.max(Number(req.query.limit) || 10, 1),
            100
        );

        const search = req.query.search || "";

        const filter = {
            role: "customer",
            $or: [
                { username: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
                { phone: { $regex: search, $options: "i" } }
            ]
        };

        const customers = await User.find(filter)
            .select("-password")
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        const totalCustomers = await User.countDocuments(filter);

        res.status(200).json({
            message: "Customers fetched successfully",
            totalCustomers,
            currentPage: page,
            totalPages: Math.ceil(totalCustomers / limit),
            customers
        });

    } catch (error) {
        res.status(500).json({
            message: "Failed to fetch customers",
            error: error.message
        });
    }
};

// 2. Get customer by ID
const getCustomerById = async (req, res) => {
    try {
        const customer = await User.findOne({
            _id: req.params.id,
            role: "customer"
        }).select("-password");

        if (!customer) {
            return res.status(404).json({
                message: "Customer not found"
            });
        }

        res.status(200).json({
            message: "Customer fetched successfully",
            customer
        });

    } catch (error) {
        res.status(500).json({
            message: "Failed to fetch customer",
            error: error.message
        });
    }
};

// 3. Update customer details
const updateCustomer = async (req, res) => {
    try {
        const allowedFields = ["name", "phone","role"];

        const updates = {};

        allowedFields.forEach((field) => {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        });

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                message: "No valid fields provided for update"
            });
        }

        const customer = await User.findOneAndUpdate(
            {
                _id: req.params.id,
                role: "customer"
            },
            { $set: updates },
            {
                new: true,
                runValidators: true
            }
        ).select("-password");

        if (!customer) {
            return res.status(404).json({
                message: "Customer not found"
            });
        }

        res.status(200).json({
            message: "Customer updated successfully",
            customer
        });

    } catch (error) {
        res.status(500).json({
            message: "Failed to update customer",
            error: error.message
        });
    }
};

// 4. Block or unblock customer
const updateCustomerStatus = async (req, res) => {
    try {
        const { isActive } = req.body;

        if (typeof isActive !== "boolean") {
            return res.status(400).json({
                message: "isActive must be true or false"
            });
        }

        const customer = await User.findOneAndUpdate(
            {
                _id: req.params.id,
                role: "customer"
            },
            { $set: { isActive } },
            {
                new: true,
                runValidators: true
            }
        ).select("-password");

        if (!customer) {
            return res.status(404).json({
                message: "Customer not found"
            });
        }

        res.status(200).json({
            message: isActive
                ? "Customer unblocked successfully"
                : "Customer blocked successfully",
            customer
        });

    } catch (error) {
        res.status(500).json({
            message: "Failed to update customer status",
            error: error.message
        });
    }
};

// 5. Deactivate customer
const deleteCustomer = async (req, res) => {
    try {
        const customer = await User.findOneAndUpdate(
            {
                _id: req.params.id,
                role: "customer"
            },
            { $set: { isActive: false } },
            { new: true }
        ).select("-password");

        if (!customer) {
            return res.status(404).json({
                message: "Customer not found"
            });
        }

        res.status(200).json({
            message: "Customer deactivated successfully"
        });

    } catch (error) {
        res.status(500).json({
            message: "Failed to deactivate customer",
            error: error.message
        });
    }
};

module.exports = {
    getAllCustomers,
    getCustomerById,
    updateCustomer,
    updateCustomerStatus,
    deleteCustomer
};