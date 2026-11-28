const Order = require('../models/order');
const User = require('../models/user');

const getDashboardOverview = async (req, res) => {
    try {
        const [totalAssignedOrders, pendingOrders, activeOrders, completedOrders] = await Promise.all([
            Order.countDocuments({ assignedTailor: req.user._id }),
            Order.countDocuments({ assignedTailor: req.user._id, status: 'tailor_assigned' }),
            Order.countDocuments({ assignedTailor: req.user._id, status: 'tailoring' }),
            Order.countDocuments({ assignedTailor: req.user._id, status: { $in: ['ready_for_delivery', 'out_for_delivery', 'delivered'] } })
        ]);
        res.status(200).json({ totalAssignedOrders, pendingOrders, activeOrders, completedOrders });
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch tailor dashboard', error: error.message });
    }
};

const getAssignedOrders = async (req, res) => {
    try {
        const orders = await Order.find({ assignedTailor: req.user._id })
            .populate('customerId', 'name email phone')
            .populate('customizationId', 'customizationName status')
            .sort({ createdAt: -1 });
        res.status(200).json({ count: orders.length, orders });
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch assigned orders', error: error.message });
    }
};

const getMonthlyReport = async (req, res) => {
    const year = Number(req.query.year);
    const month = Number(req.query.month);
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        return res.status(400).json({ message: 'Provide a valid year and month' });
    }
    try {
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 1);
        const [assigned, completed] = await Promise.all([
            Order.countDocuments({ assignedTailor: req.user._id, createdAt: { $gte: startDate, $lt: endDate } }),
            Order.countDocuments({ assignedTailor: req.user._id, status: { $in: ['ready_for_delivery', 'out_for_delivery', 'delivered'] }, updatedAt: { $gte: startDate, $lt: endDate } })
        ]);
        res.status(200).json({ year, month, assigned, completed });
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch tailor report', error: error.message });
    }
};

const getProfile = async (req, res) => {
    const user = await User.findOne({ _id: req.user._id, role: 'tailor' }).select('-password');
    if (!user) return res.status(404).json({ message: 'Tailor not found' });
    res.status(200).json({ profile: user });
};

const updateProfile = async (req, res) => {
    const updates = {};
    if (req.body.name !== undefined || req.body.username !== undefined) updates.name = req.body.name ?? req.body.username;
    if (req.body.phone !== undefined) updates.phone = req.body.phone;
    if (req.body.professionalDetails !== undefined) updates.professionalDetails = req.body.professionalDetails;
    if (!Object.keys(updates).length) return res.status(400).json({ message: 'No valid profile fields provided' });
    try {
        const user = await User.findOneAndUpdate({ _id: req.user._id, role: 'tailor' }, { $set: updates }, { new: true, runValidators: true }).select('-password');
        res.status(200).json({ profile: user });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const updateAvailability = async (req, res) => {
    const { availabilityStatus } = req.body;
    if (!['available', 'unavailable'].includes(availabilityStatus)) return res.status(400).json({ message: 'Availability must be available or unavailable' });
    const user = await User.findOneAndUpdate({ _id: req.user._id, role: 'tailor' }, { $set: { availabilityStatus } }, { new: true }).select('availabilityStatus');
    res.status(200).json({ availabilityStatus: user.availabilityStatus });
};

module.exports = { getDashboardOverview, getAssignedOrders, getMonthlyReport, getProfile, updateProfile, updateAvailability };
