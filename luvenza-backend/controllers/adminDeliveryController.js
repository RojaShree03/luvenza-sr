const User = require("../models/user");

exports.getDeliveryPartners = async (req, res) => {
    try {
        const partners = await User.find({
            role: "deliver_partner"
        })
            .select("-password")
            .sort({ createdAt: -1 });

        res.status(200).json({ deliveryPartners: partners });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getDeliveryPartnerById = async (req, res) => {
    try {
        const partner = await User.findOne({
            _id: req.params.id,
            role: "deliver_partner"
        }).select("-password");

        if (!partner) {
            return res.status(404).json({
                message: "Delivery partner not found"
            });
        }

        res.status(200).json({ partner });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateDeliveryPartner = async (req, res) => {
    try {
        const allowed = ["name", "phone", "deliveryDetails"];
        const updates = {};

        allowed.forEach((field) => {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        });

        const partner = await User.findOneAndUpdate(
            { _id: req.params.id, role: "deliver_partner" },
            { $set: updates },
            { new: true, runValidators: true }
        ).select("-password");

        if (!partner) {
            return res.status(404).json({
                message: "Delivery partner not found"
            });
        }

        res.status(200).json({
            message: "Delivery partner updated successfully",
            partner
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.updateDeliveryStatus = async (req, res) => {
    try {
        const { isActive, isApproved } = req.body;
        const updates = {};

        if (typeof isActive === "boolean") {
            updates.isActive = isActive;
        }

        if (typeof isApproved === "boolean") {
            updates.isApproved = isApproved;
        }

        if (!Object.keys(updates).length) {
            return res.status(400).json({
                message: "Provide isActive or isApproved as a boolean"
            });
        }

        const partner = await User.findOneAndUpdate(
            { _id: req.params.id, role: "deliver_partner" },
            { $set: updates },
            { new: true }
        ).select("-password");

        if (!partner) {
            return res.status(404).json({
                message: "Delivery partner not found"
            });
        }

        res.status(200).json({
            message: "Delivery partner status updated",
            partner
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
