const Measurement = require('../models/measurement');

// GET - View all measurement profiles
const getMeasurements = async (req, res) => {
    try {
        const measurements = await Measurement.find({
            userId: req.user._id
        });

        res.status(200).json({
            success: true,
            count: measurements.length,
            measurements
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};


// GET - View one measurement profile
const getMeasurementById = async (req, res) => {
    try {
        const measurement = await Measurement.findOne({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!measurement) {
            return res.status(404).json({
                message: 'Measurement profile not found'
            });
        }

        res.status(200).json({
            success: true,
            measurement
        });

    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


// POST - Save a new measurement profile
const createMeasurement = async (req, res) => {
    try {
        const { profileName, measurements } = req.body;

        if (!profileName || !measurements) {
            return res.status(400).json({
                message: 'Profile name and measurements are required'
            });
        }

        const newMeasurement = await Measurement.create({
            userId: req.user._id,
            profileName,
            measurements
        });

        res.status(201).json({
            success: true,
            message: 'Measurement profile saved',
            measurement: newMeasurement
        });

    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


// PUT - Update a measurement profile
const updateMeasurement = async (req, res) => {
    try {
        const { profileName, measurements } = req.body;

        const measurement = await Measurement.findOne({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!measurement) {
            return res.status(404).json({
                message: 'Measurement profile not found'
            });
        }

        if (profileName !== undefined) {
            measurement.profileName = profileName;
        }

        if (measurements !== undefined) {
            measurement.measurements = measurements;
        }

        await measurement.save();

        res.status(200).json({
            success: true,
            message: 'Measurement profile updated',
            measurement
        });

    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};


// DELETE - Delete a measurement profile
const deleteMeasurement = async (req, res) => {
    try {
        const measurement = await Measurement.findOneAndDelete({
            _id: req.params.id,
            userId: req.user._id
        });

        if (!measurement) {
            return res.status(404).json({
                message: 'Measurement profile not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Measurement profile deleted'
        });

    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

module.exports = {
    getMeasurements,
    getMeasurementById,
    createMeasurement,
    updateMeasurement,
    deleteMeasurement
};