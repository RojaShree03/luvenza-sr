const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/authMiddleware');

const {
    getMeasurements,
    getMeasurementById,
    createMeasurement,
    updateMeasurement,
    deleteMeasurement
} = require('../controllers/measurementController');

router.get('/', authMiddleware, getMeasurements);
router.get('/:id', authMiddleware, getMeasurementById);
router.post('/', authMiddleware, createMeasurement);
router.put('/:id', authMiddleware, updateMeasurement);
router.delete('/:id', authMiddleware, deleteMeasurement);

module.exports = router;