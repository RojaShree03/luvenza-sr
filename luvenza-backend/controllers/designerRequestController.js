const mongoose = require("mongoose");
const Customization = require("../models/customization");
const User = require("../models/user");

// GET /api/designer/requests
exports.getCustomizationRequests = async (req, res) => {
    try {
        const requests = await Customization.find({
            status: {
                $in: [
                    "pending_review",
                    "suggested",
                    "awaiting_customer_confirmation",
                    "customer_confirmed",
                    "approved"
                ]
            }
        })
            .populate("userId", "username email phone")
            .populate("productId")
            .populate("measurementId")
            .populate("assignedTailor", "username phone")
            .sort({ createdAt: -1 });

        res.status(200).json({
            count: requests.length,
            requests
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to fetch requests",
            error: error.message
        });
    }
};


// PUT /api/designer/requests/:id/approve
exports.approveRequest = async (req, res) => {
    try {
        const {
            notes,
            estimatedCost,
            estimatedDeliveryDate
        } = req.body;

        if (
            typeof estimatedCost !== "number" ||
            estimatedCost < 0 ||
            !estimatedDeliveryDate ||
            isNaN(Date.parse(estimatedDeliveryDate))
        ) {
            return res.status(400).json({
                message: "Valid estimated cost and delivery date are required"
            });
        }

        const request = await Customization.findOneAndUpdate(
            {
                _id: req.params.id,
                status: {
                    $in: ["pending_review", "customer_confirmed"]
                }
            },
            {
                $set: {
                    status: "approved",
                    "designerReview.notes": notes || "",
                    "designerReview.estimatedCost": estimatedCost,
                    "designerReview.estimatedDeliveryDate":
                        new Date(estimatedDeliveryDate),
                    "designerReview.reviewedAt": new Date()
                }
            },
            { new: true, runValidators: true }
        );

        if (!request) {
            return res.status(404).json({
                message: "Request not found or cannot be approved in its current status"
            });
        }

        res.status(200).json({
            message: "Customization approved. Await customer confirmation.",
            request
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to approve request",
            error: error.message
        });
    }
};


// PUT /api/designer/requests/:id/suggest
exports.suggestAlternative = async (req, res) => {
    try {
        const {
            notes,
            suggestedFabric,
            suggestedDesign,
            estimatedCost,
            estimatedDeliveryDate
        } = req.body;

        if (
            !suggestedFabric &&
            !suggestedDesign &&
            !notes
        ) {
            return res.status(400).json({
                message: "Provide an alternative fabric, design or suggestion"
            });
        }

        if (
            estimatedCost !== undefined &&
            (typeof estimatedCost !== "number" || estimatedCost < 0)
        ) {
            return res.status(400).json({
                message: "Estimated cost must be a non-negative number"
            });
        }

        if (
            estimatedDeliveryDate &&
            isNaN(Date.parse(estimatedDeliveryDate))
        ) {
            return res.status(400).json({
                message: "Invalid delivery date"
            });
        }

        const request = await Customization.findOneAndUpdate(
            {
                _id: req.params.id,
                status: {
                    $in: ["pending_review", "customer_confirmed"]
                }
            },
            {
                $set: {
                    status: "awaiting_customer_confirmation",
                    "designerReview.notes": notes || "",
                    "designerReview.suggestedFabric": suggestedFabric || "",
                    "designerReview.suggestedDesign": suggestedDesign || "",
                    "designerReview.estimatedCost": estimatedCost,
                    "designerReview.estimatedDeliveryDate":
                        estimatedDeliveryDate
                            ? new Date(estimatedDeliveryDate)
                            : undefined,
                    "designerReview.reviewedAt": new Date()
                }
            },
            { new: true, runValidators: true }
        );

        if (!request) {
            return res.status(404).json({
                message: "Request not found or cannot be updated in its current status"
            });
        }

        res.status(200).json({
            message: "Alternative suggestion sent to customer for confirmation",
            request
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to send suggestion",
            error: error.message
        });
    }
};


// PUT /api/designer/requests/:id/reject
exports.rejectRequest = async (req, res) => {
    try {
        const { reason } = req.body;

        if (!reason || !reason.trim()) {
            return res.status(400).json({
                message: "Rejection reason is required"
            });
        }

        const request = await Customization.findOneAndUpdate(
            {
                _id: req.params.id,
                status: {
                    $in: [
                        "pending_review",
                        "customer_confirmed",
                        "awaiting_customer_confirmation"
                    ]
                }
            },
            {
                $set: {
                    status: "rejected",
                    "designerReview.notes": reason,
                    "designerReview.reviewedAt": new Date()
                }
            },
            { new: true, runValidators: true }
        );

        if (!request) {
            return res.status(404).json({
                message: "Request not found or cannot be rejected in its current status"
            });
        }

        res.status(200).json({
            message: "Customization request rejected",
            request
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to reject request",
            error: error.message
        });
    }
};