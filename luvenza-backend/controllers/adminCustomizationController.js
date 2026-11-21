const Customization = require("../models/customization");

exports.getAllCustomizations = async (req, res) => {
    try {
        const customizations = await Customization.find()
            .populate("userId", "username email")
            .populate("productId")
            .populate("measurementId")
            .populate("assignedTailor", "username phone")
            .sort({ createdAt: -1 });

        res.status(200).json({
            count: customizations.length,
            customizations
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getCustomizationById = async (req, res) => {
    try {
        const customization = await Customization.findById(req.params.id)
            .populate("userId", "username email phone")
            .populate("productId")
            .populate("measurementId")
            .populate("assignedTailor", "username phone");

        if (!customization) {
            return res.status(404).json({
                message: "Customization not found"
            });
        }

        res.status(200).json({ customization });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateCustomizationStatus = async (req, res) => {
    try {
        const allowedStatuses = [
            "pending_review",
            "suggested",
            "awaiting_customer_confirmation",
            "customer_confirmed",
            "approved",
            "rejected",
            "tailor_assigned",
            "in_progress",
            "completed"
        ];

        const { status } = req.body;

        if (!allowedStatuses.includes(status)) {
            return res.status(400).json({
                message: "Invalid customization status"
            });
        }

        const customization = await Customization.findByIdAndUpdate(
            req.params.id,
            { $set: { status } },
            { new: true, runValidators: true }
        );

        if (!customization) {
            return res.status(404).json({
                message: "Customization not found"
            });
        }

        res.status(200).json({
            message: "Customization status updated",
            customization
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.deleteCustomization = async (req, res) => {
    try {
        const customization = await Customization.findById(req.params.id);

        if (!customization) {
            return res.status(404).json({
                message: "Customization not found"
            });
        }

        // Don't remove records linked to an order.
        const Order = require("../models/order");

        const linkedOrder = await Order.exists({
            customizationId: customization._id
        });

        if (linkedOrder) {
            return res.status(400).json({
                message: "Cannot delete customization linked to an order"
            });
        }

        await customization.deleteOne();

        res.status(200).json({
            message: "Customization deleted successfully"
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};