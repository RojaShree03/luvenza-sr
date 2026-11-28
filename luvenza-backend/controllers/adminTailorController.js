const User = require("../models/user");

exports.getTailors = async (req, res) => {
    try {
        const tailors = await User.find({ role: "tailor" })
            .select("-password")
            .sort({ createdAt: -1 });

        res.status(200).json({ tailors });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getTailorById = async (req, res) => {
    try {
        const tailor = await User.findOne({
            _id: req.params.id,
            role: "tailor"
        }).select("-password");

        if (!tailor) {
            return res.status(404).json({ message: "Tailor not found" });
        }

        res.status(200).json({ tailor });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateTailor = async (req, res) => {
    try {
        const allowed = ["name", "username", "phone", "professionalDetails"];
        const updates = {};

        allowed.forEach((field) => {
            if (req.body[field] !== undefined) {
                updates[field === "username" ? "name" : field] = req.body[field];
            }
        });

        const tailor = await User.findOneAndUpdate(
            { _id: req.params.id, role: "tailor" },
            { $set: updates },
            { new: true, runValidators: true }
        ).select("-password");

        if (!tailor) {
            return res.status(404).json({ message: "Tailor not found" });
        }

        res.status(200).json({
            message: "Tailor updated successfully",
            tailor
        });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.updateTailorStatus = async (req, res) => {
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

        const tailor = await User.findOneAndUpdate(
            { _id: req.params.id, role: "tailor" },
            { $set: updates },
            { new: true }
        ).select("-password");

        if (!tailor) {
            return res.status(404).json({ message: "Tailor not found" });
        }

        res.status(200).json({
            message: "Tailor status updated",
            tailor
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
