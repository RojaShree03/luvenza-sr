const mongoose = require("mongoose");
const Order = require("../models/order");
const User = require("../models/user");
const paymentRepository = require('../repositories/paymentRepository');

exports.getOrders = async (req, res) => {
    try {
        const orders = await Order.find()
            .populate("customerId", "name email phone")
            .populate("assignedTailor", "name phone")
            .populate("assignedDeliveryPartner", "name phone")
            .populate("customizationId")
            .sort({ createdAt: -1 });

        orders.forEach(normalizeOrderForResponse);

        res.status(200).json({
            count: orders.length,
            orders
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getOrderById = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id)
            .populate("customerId", "name email phone")
            .populate("assignedTailor", "name phone")
            .populate("assignedDeliveryPartner", "name phone")
            .populate("customizationId");

        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }

        normalizeOrderForResponse(order);
        res.status(200).json({ order });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateOrderStatus = async (req, res) => {
    try {
        const nextStatus = normalizeOrderStatus(req.body.status);

        if (!nextStatus) {
            return res.status(400).json({ message: "Invalid order status" });
        }

        const order = status === 'cancelled'
            ? await paymentRepository.cancelIfNoActivePayment(req.params.id)
            : await Order.findByIdAndUpdate(
            req.params.id,
            { $set: { status } },
            { new: true, runValidators: true }
        );

        if (!order) {
            return res.status(409).json({ message: "Order status changed; reload and retry" });
        }

        normalizeOrderForResponse(order);
        res.status(200).json({
            message: "Order status updated",
            order
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Assign an available, approved tailor
exports.assignTailor = async (req, res) => {
    try {
        const { tailorId } = req.body;

        if (!mongoose.isValidObjectId(tailorId)) {
            return res.status(400).json({ message: "Invalid tailor ID" });
        }

        const tailor = await User.findOne({
            _id: tailorId,
            role: "tailor",
            isActive: true,
            isApproved: true
        });

        if (!tailor) {
            return res.status(400).json({
                message: "Tailor is not active, approved or does not exist"
            });
        }

        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ message: "Invalid order ID" });
        }

        const existingOrder = await Order.findById(req.params.id);
        if (
            !existingOrder
            || !canTransitionOrderStatus(existingOrder.status, "In_Production", "admin")
        ) {
            return res.status(404).json({
                message: "Order not found or not ready for tailor assignment"
            });
        }

        const order = await Order.findOneAndUpdate(
            {
                _id: existingOrder._id,
                status: { $in: storedStatusValues(existingOrder.status) }
            },
            {
                $set: {
                    assignedTailor: tailorId,
                    status: "In_Production"
                }
            },
            { new: true, runValidators: true }
        );

        if (!order) {
            return res.status(404).json({
                message: "Order not found or not ready for tailor assignment"
            });
        }

        normalizeOrderForResponse(order);
        res.status(200).json({
            message: "Tailor assigned successfully",
            order
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Assign an available, approved delivery partner
exports.assignDeliveryPartner = async (req, res) => {
    try {
        const { deliveryPartnerId } = req.body;

        if (!mongoose.isValidObjectId(deliveryPartnerId)) {
            return res.status(400).json({
                message: "Invalid delivery partner ID"
            });
        }

        const partner = await User.findOne({
            _id: deliveryPartnerId,
            role: "deliver_partner",
            isActive: true,
            isApproved: true
        });

        if (!partner) {
            return res.status(400).json({
                message: "Delivery partner is not active, approved or does not exist"
            });
        }

        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ message: "Invalid order ID" });
        }

        const existingOrder = await Order.findById(req.params.id);
        if (
            !existingOrder
            || !canTransitionOrderStatus(existingOrder.status, "Out_For_Delivery", "admin")
            || normalizeOrderStatus(existingOrder.status) !== "Ready_For_Dispatch"
        ) {
            return res.status(404).json({
                message: "Order not found or not ready for delivery"
            });
        }

        const order = await Order.findOneAndUpdate(
            {
                _id: existingOrder._id,
                status: { $in: storedStatusValues(existingOrder.status) }
            },
            {
                $set: {
                    assignedDeliveryPartner: deliveryPartnerId,
                    status: "Out_For_Delivery"
                }
            },
            { new: true, runValidators: true }
        );

        if (!order) {
            return res.status(404).json({
                message: "Order not found or not ready for delivery"
            });
        }

        normalizeOrderForResponse(order);
        res.status(200).json({
            message: "Delivery partner assigned successfully",
            order
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.cancelOrder = async (req, res) => {
    try {
        const order = await paymentRepository.cancelIfNoActivePayment(req.params.id);

        const existingOrder = await Order.findById(req.params.id);
        if (
            !existingOrder
            || ["Delivered", "Cancelled"].includes(normalizeOrderStatus(existingOrder.status))
            || !canTransitionOrderStatus(existingOrder.status, "Cancelled", "admin")
        ) {
            return res.status(404).json({
                message: "Order not found or cannot be cancelled"
            });
        }

        const order = await Order.findOneAndUpdate(
            { _id: existingOrder._id, status: existingOrder.status },
            { $set: { status: "Cancelled" } },
            { new: true, runValidators: true }
        );

        if (!order) {
            return res.status(409).json({ message: "Order status changed; reload and retry" });
        }

        normalizeOrderForResponse(order);
        res.status(200).json({
            message: "Order cancelled successfully",
            order
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
