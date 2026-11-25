const User = require('../models/user');

const isPlainObject = value => Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
);

const hasUnsafeKeys = value => Object.keys(value).some(
    key => ['__proto__', 'prototype', 'constructor'].includes(key)
);

const validateProfilePayload = ({ personalDetails, address }) => {
    if (!isPlainObject(personalDetails) || !isPlainObject(address)) {
        return 'Personal details and address must be objects';
    }

    if (hasUnsafeKeys(personalDetails) || hasUnsafeKeys(address)) {
        return 'Profile contains an invalid field';
    }

    return null;
};

// GET - View profile
const getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .select('-password -resetPasswordOTP -resetPasswordOTPExpiry -resetPasswordOTPAttempts -resetPasswordOTPBlockedUntil');

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

        const validationError = validateProfilePayload({ personalDetails, address });
        if (validationError) {
            return res.status(400).json({ success: false, message: validationError });
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

        const allowedFields = ['personalDetails', 'address'];

        for (const field of Object.keys(req.body)) {
            if (!allowedFields.includes(field)) {
                return res.status(400).json({
                    message: `Cannot update ${field}`
                });
            }
        }

        if (
            (req.body.personalDetails !== undefined && !isPlainObject(req.body.personalDetails))
            || (req.body.address !== undefined && !isPlainObject(req.body.address))
        ) {
            return res.status(400).json({
                success: false,
                message: 'Personal details and address must be objects'
            });
        }

        if (
            (req.body.personalDetails && hasUnsafeKeys(req.body.personalDetails))
            || (req.body.address && hasUnsafeKeys(req.body.address))
        ) {
            return res.status(400).json({
                success: false,
                message: 'Profile contains an invalid field'
            });
        }

        if (req.body.personalDetails !== undefined) {
            user.personalDetails = {
                ...(user.personalDetails?.toObject?.() || user.personalDetails || {}),
                ...req.body.personalDetails
            };
        }

        if (req.body.address !== undefined) {
            user.address = {
                ...(user.address?.toObject?.() || user.address || {}),
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

module.exports = {
    getProfile,
    createProfile,
    updateProfile,
    deleteProfile
};
