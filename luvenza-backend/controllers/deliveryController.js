
const mongoose = require("mongoose");

const User = require("../models/user.js");
const Order = require("../models/order.js");

// Check MongoDB ID
const isValidId = (id) => mongoose.isValidObjectId(id);

// Record delivery activity
const addActivity = (order, userId, action, description) => {
    order.activityHistory.push({
        performedBy: userId,
        role: "deliver_partner",
        action,
        description,
        createdAt: new Date()
    });
};

// Update availability based on active deliveries
const updatePartnerAvailability = async (userId) => {
    const activeDelivery = await Order.exists({
        assignedDeliveryPartner: userId,
        status: {
            $in: [
                "delivery_assigned",
                "delivery_accepted",
                "out_for_delivery"
            ]
        }
    });

    await User.findOneAndUpdate(
        { _id: userId, role: "deliver_partner" },
        {
            availabilityStatus: activeDelivery ? "busy" : "available"
        }
    );
};


// 1. View assigned deliveries
exports.getAssignedDeliveries = async (req, res) => {
    try {
        const orders = await Order.find({
            assignedDeliveryPartner: req.user._id,
            status: {
                $in: [
                    "delivery_assigned",
                    "delivery_accepted",
                    "out_for_delivery",
                    "delivered"
                ]
            }
        })
        .populate("customerId", "name email phone")
        .populate({
            path: "customizationId",
            populate: {
                path: "productId",
                select: "productName"
            }
        })
        .sort({ createdAt: -1 });

        res.status(200).json({
            count: orders.length,
            orders
        });

    } catch (error) {
        res.status(500).json({
            message: "Failed to fetch assigned deliveries",
            error: error.message
        });
    }
};


// 2. View one assigned delivery
exports.getDeliveryById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidId(id)) {
            return res.status(400).json({
                message: "Invalid order ID"
            });
        }

        const order = await Order.findOne({
            _id: id,
            assignedDeliveryPartner: req.user._id
        })
        .populate("customerId", "name email phone")
        .populate({
            path: "customizationId",
            populate: {
                path: "productId",
                select: "productName"
            }
        });

        if (!order) {
            return res.status(404).json({
                message: "Delivery order not found"
            });
        }

        res.status(200).json({ order });

    } catch (error) {
        res.status(500).json({
            message: "Failed to fetch delivery details",
            error: error.message
        });
    }
};


// 3. Accept delivery assignment
exports.acceptDelivery = async (req, res) => {
    try {
        const { id } = req.params;

        if (!isValidId(id)) {
            return res.status(400).json({
                message: "Invalid order ID"
            });
        }

        const order = await Order.findOneAndUpdate(
            {
                _id: id,
                assignedDeliveryPartner: req.user._id,
                status: "delivery_assigned"
            },
            {
                $set: {
                    status: "delivery_accepted",
                    "deliveryDetails.acceptedAt": new Date()
                }
            },
            { new: true }
        );

        if (!order) {
            return res.status(400).json({
                message: "Order not found, already accepted, or not assigned to you"
            });
        }

        addActivity(
            order,
            req.user._id,
            "delivery_accepted",
            "Delivery assignment accepted"
        );

        await order.save();
        await updatePartnerAvailability(req.user._id);

        res.status(200).json({
            message: "Delivery assignment accepted",
            order
        });

    } catch (error) {
        res.status(500).json({
            message: "Failed to accept delivery",
            error: error.message
        });
    }
};


// 4. Reject delivery assignment
exports.rejectDelivery = async (req, res) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;

        if (!isValidId(id)) {
            return res.status(400).json({
                message: "Invalid order ID"
            });
        }

        if (!reason || !reason.trim()) {
            return res.status(400).json({
                message: "Rejection reason is required"
            });
        }

        const order = await Order.findOne({
            _id: id,
            assignedDeliveryPartner: req.user._id,
            status: "delivery_assigned"
        });

        if (!order) {
            return res.status(400).json({
                message: "Order cannot be rejected. It may already be accepted or not assigned to you."
            });
        }

        order.deliveryDetails = {
            ...(order.deliveryDetails?.toObject
                ? order.deliveryDetails.toObject()
                : order.deliveryDetails || {}),
            rejectionReason: reason
        };

        addActivity(
            order,
            req.user._id,
            "delivery_rejected",
            `Delivery assignment rejected: ${reason}`
        );

        order.assignedDeliveryPartner = undefined;
        order.status = "ready_for_delivery";

        await order.save();
        await updatePartnerAvailability(req.user._id);

        res.status(200).json({
            message: "Delivery assignment rejected. It is available for reassignment.",
            order
        });

    } catch (error) {
        res.status(500).json({
            message: "Failed to reject delivery",
            error: error.message
        });
    }
};


// 5. Update delivery status
exports.updateDeliveryStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, trackingNote } = req.body;

        if (!isValidId(id)) {
            return res.status(400).json({
                message: "Invalid order ID"
            });
        }

        const order = await Order.findOne({
            _id: id,
            assignedDeliveryPartner: req.user._id
        });

        if (!order) {
            return res.status(404).json({
                message: "Assigned delivery not found"
            });
        }

        // Only allow valid next steps
        if (
            status === "out_for_delivery" &&
            order.status !== "delivery_accepted"
        ) {
            return res.status(400).json({
                message: "Accept the delivery before starting delivery"
            });
        }

        if (
            status === "delivered" &&
            order.status !== "out_for_delivery"
        ) {
            return res.status(400).json({
                message: "Order must be out for delivery before marking it delivered"
            });
        }

        if (!["out_for_delivery", "delivered"].includes(status)) {
            return res.status(400).json({
                message: "Invalid delivery status"
            });
        }

        order.status = status;

        const details = order.deliveryDetails?.toObject
            ? order.deliveryDetails.toObject()
            : (order.deliveryDetails || {});

        if (status === "out_for_delivery") {
            details.pickedUpAt = new Date();
        }

        if (status === "delivered") {
            details.deliveredAt = new Date();
        }

        if (trackingNote) {
            details.trackingNote = trackingNote;
        }

        order.deliveryDetails = details;

        addActivity(
            order,
            req.user._id,
            status,
            status === "delivered"
                ? "Order successfully delivered"
                : "Order picked up and is out for delivery"
        );

        await order.save();

        if (status === "delivered") {
            await updatePartnerAvailability(req.user._id);
        }

        res.status(200).json({
            message: `Order status updated to ${status}`,
            order
        });

    } catch (error) {
        res.status(500).json({
            message: "Failed to update delivery status",
            error: error.message
        });
    }
};


// 6. Update availability
exports.updateAvailability = async (req, res) => {
    try {
        const { availabilityStatus } = req.body;

        if (!["available", "unavailable"].includes(availabilityStatus)) {
            return res.status(400).json({
                message: "Availability must be available or unavailable"
            });
        }

        if (availabilityStatus === "available") {
            const activeDelivery = await Order.exists({
                assignedDeliveryPartner: req.user._id,
                status: {
                    $in: [
                        "delivery_assigned",
                        "delivery_accepted",
                        "out_for_delivery"
                    ]
                }
            });

            if (activeDelivery) {
                return res.status(400).json({
                    message: "Complete or reject active deliveries before becoming available"
                });
            }
        }

        const partner = await User.findOneAndUpdate(
            {
                _id: req.user._id,
                role: "deliver_partner",
                isActive: true,
                isApproved: true
            },
            { availabilityStatus },
            { new: true }
        ).select("-password");

        if (!partner) {
            return res.status(403).json({
                message: "Delivery partner account is inactive or not approved"
            });
        }

        res.status(200).json({
            message: "Availability updated",
            availabilityStatus: partner.availabilityStatus
        });

    } catch (error) {
        res.status(500).json({
            message: "Failed to update availability",
            error: error.message
        });
    }
};


// 7. View own profile
exports.getDeliveryProfile = async (req, res) => {
    try {
        const partner = await User.findOne({
            _id: req.user._id,
            role: "deliver_partner"
        }).select("-password");

        if (!partner) {
            return res.status(404).json({
                message: "Delivery partner not found"
            });
        }

        res.status(200).json({ partner });

    } catch (error) {
        res.status(500).json({
            message: "Failed to fetch profile",
            error: error.message
        });
    }
};


// 8. Update own profile
exports.updateDeliveryProfile = async (req, res) => {
    try {
        const { username, phone, deliveryDetails } = req.body;

        const updates = {};

        if (username !== undefined) updates.name = username;
        if (phone !== undefined) updates.phone = phone;

        if (deliveryDetails !== undefined) {
            updates.deliveryDetails = deliveryDetails;
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                message: "No valid fields provided"
            });
        }

        const partner = await User.findOneAndUpdate(
            {
                _id: req.user._id,
                role: "deliver_partner"
            },
            { $set: updates },
            { new: true, runValidators: true }
        ).select("-password");

        if (!partner) {
            return res.status(404).json({
                message: "Delivery partner not found"
            });
        }

        res.status(200).json({
            message: "Profile updated successfully",
            partner
        });

    } catch (error) {
        res.status(500).json({
            message: "Failed to update profile",
            error: error.message
        });
    }
};


// 9. Dashboard overview
exports.getDashboardOverview = async (req, res) => {
    try {
        const partnerId = req.user._id;

        const [
            totalAssigned,
            pending,
            accepted,
            outForDelivery,
            delivered,
            partner
        ] = await Promise.all([
            Order.countDocuments({
                assignedDeliveryPartner: partnerId
            }),
            Order.countDocuments({
                assignedDeliveryPartner: partnerId,
                status: "delivery_assigned"
            }),
            Order.countDocuments({
                assignedDeliveryPartner: partnerId,
                status: "delivery_accepted"
            }),
            Order.countDocuments({
                assignedDeliveryPartner: partnerId,
                status: "out_for_delivery"
            }),
            Order.countDocuments({
                assignedDeliveryPartner: partnerId,
                status: "delivered"
            }),
            User.findById(partnerId).select("availabilityStatus")
        ]);

        res.status(200).json({
            totalAssigned,
            pending,
            accepted,
            outForDelivery,
            delivered,
            availabilityStatus: partner?.availabilityStatus
        });

    } catch (error) {
        res.status(500).json({
            message: "Failed to fetch dashboard overview",
            error: error.message
        });
    }
};


// 10. Delivery order statistics
exports.getDeliveryStatistics = async (req, res) => {
    try {
        const statistics = await Order.aggregate([
            {
                $match: {
                    assignedDeliveryPartner: req.user._id
                }
            },
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 }
                }
            },
            {
                $sort: { _id: 1 }
            }
        ]);

        res.status(200).json({ statistics });

    } catch (error) {
        res.status(500).json({
            message: "Failed to fetch delivery statistics",
            error: error.message
        });
    }
};


// 11. Performance report
exports.getPerformanceReport = async (req, res) => {
    try {
        const report = await Order.aggregate([
            {
                $match: {
                    assignedDeliveryPartner: req.user._id,
                    status: "delivered",
                    "deliveryDetails.pickedUpAt": { $ne: null },
                    "deliveryDetails.deliveredAt": { $ne: null }
                }
            },
            {
                $project: {
                    durationMinutes: {
                        $divide: [
                            {
                                $subtract: [
                                    "$deliveryDetails.deliveredAt",
                                    "$deliveryDetails.pickedUpAt"
                                ]
                            },
                            60000
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    completedDeliveries: { $sum: 1 },
                    averageDeliveryMinutes: {
                        $avg: "$durationMinutes"
                    }
                }
            }
        ]);

        res.status(200).json({
            performance: report[0] || {
                completedDeliveries: 0,
                averageDeliveryMinutes: 0
            }
        });

    } catch (error) {
        res.status(500).json({
            message: "Failed to fetch performance report",
            error: error.message
        });
    }
};


// 12. Recent activity
exports.getRecentActivity = async (req, res) => {
    try {
        const orders = await Order.find({
            "activityHistory.performedBy": req.user._id
        })
        .select("activityHistory customerId")
        .sort({ updatedAt: -1 })
        .limit(20);

        const activities = [];

        orders.forEach((order) => {
            order.activityHistory.forEach((activity) => {
                if (
                    activity.performedBy &&
                    activity.performedBy.toString() === req.user._id.toString()
                ) {
                    activities.push({
                        orderId: order._id,
                        action: activity.action,
                        description: activity.description,
                        date: activity.createdAt
                    });
                }
            });
        });

        activities.sort(
            (a, b) => new Date(b.date) - new Date(a.date)
        );

        res.status(200).json({
            activities: activities.slice(0, 20)
        });

    } catch (error) {
        res.status(500).json({
            message: "Failed to fetch recent activity",
            error: error.message
        });
    }
};


// 13. Monthly report
exports.getMonthlyReport = async (req, res) => {
    try {
        const year = Number(req.query.year);
        const month = Number(req.query.month);

        if (
            !Number.isInteger(year) ||
            !Number.isInteger(month) ||
            month < 1 ||
            month > 12
        ) {
            return res.status(400).json({
                message: "Provide a valid year and month"
            });
        }

        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 1);

        const [
            assigned,
            completed
        ] = await Promise.all([
            Order.countDocuments({
                assignedDeliveryPartner: req.user._id,
                createdAt: { $gte: startDate, $lt: endDate }
            }),
            Order.countDocuments({
                assignedDeliveryPartner: req.user._id,
                status: "delivered",
                "deliveryDetails.deliveredAt": {
                    $gte: startDate,
                    $lt: endDate
                }
            })
        ]);

        res.status(200).json({
            year,
            month,
            assigned,
            completed
        });

    } catch (error) {
        res.status(500).json({
            message: "Failed to fetch monthly report",
            error: error.message
        });
    }
};