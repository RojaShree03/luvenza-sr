const Order = require('../models/order');
const Customization = require('../models/customization');
const Measurement = require('../models/measurement');
const User = require('../models/user');

// GET - View profile
const getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .select('-password');

        if (!user) {
            return res.status(404).json({
                message: 'User not found'
            });
        }

        res.status(200).json({
            success: true,
            profile: user
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


// POST - Complete profile for the first time
const createProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({
                message: 'User not found'
            });
        }

        if (user.profileCompleted) {
            return res.status(409).json({
                message: 'Profile already completed. Use PUT to update.'
            });
        }

        const { personalDetails, address } = req.body;

        if (!personalDetails || !address) {
            return res.status(400).json({
                message: 'Personal details and address are required'
            });
        }

        user.personalDetails = personalDetails;
        user.address = address;
        user.profileCompleted = true;

        await user.save();

        res.status(201).json({
            success: true,
            message: 'Profile created successfully'
        });

    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


// PUT - Update profile
const updateProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({
                message: 'User not found'
            });
        }

        const allowedFields = ['personalDetails', 'address', 'name', 'username', 'phone'];

        for (const field of Object.keys(req.body)) {
            if (!allowedFields.includes(field)) {
                return res.status(400).json({
                    message: `Cannot update ${field}`
                });
            }
        }

        if (req.body.name !== undefined || req.body.username !== undefined) user.name = req.body.name ?? req.body.username;
        if (req.body.phone !== undefined) user.phone = req.body.phone;

        if (req.body.personalDetails) {
            user.personalDetails = {
                ...user.personalDetails.toObject(),
                ...req.body.personalDetails
            };
        }

        if (req.body.address) {
            user.address = {
                ...user.address.toObject(),
                ...req.body.address
            };
        }

        await user.save();

        res.status(200).json({
            success: true,
            message: 'Profile updated successfully'
        });

    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


// DELETE - Clear additional profile details
const deleteProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);

        if (!user) {
            return res.status(404).json({
                message: 'User not found'
            });
        }

        user.personalDetails = {};
        user.address = {};
        user.profileCompleted = false;

        await user.save();

        res.status(200).json({
            success: true,
            message: 'Additional profile details deleted'
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const getDashboardOverview = async (req, res) => {
    try {
        const [totalOrders, savedDesigns, measurements] = await Promise.all([
            Order.countDocuments({ customerId: req.user._id }),
            Customization.countDocuments({ userId: req.user._id }),
            Measurement.countDocuments({ userId: req.user._id })
        ]);
        res.status(200).json({ totalOrders, savedDesigns, measurements });
    } catch (error) {
        res.status(500).json({ message: 'Failed to fetch customer dashboard', error: error.message });
    }
};

module.exports = {
    getDashboardOverview,
    getProfile,
    createProfile,
    updateProfile,
    deleteProfile
};