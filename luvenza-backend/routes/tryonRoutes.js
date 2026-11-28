const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/authMiddleware');
const upload = require('../middleware/uploadMiddleware');

const {
    generateTryOn,
    getTryOnHistory,
    getRemainingGenerations
} = require('../controllers/tryonController');

// Save a 3D outfit preview
router.post(
    '/generate',
    authMiddleware,
    upload.single('previewImage'),
    generateTryOn
);

// Save 3D outfit preview
router.post(
    '/generate',
    authMiddleware,
    upload.single('previewImage'),
    generateTryOn
);

// Get 3D outfit preview history
router.get(
    '/history/:customizationId',
    authMiddleware,
    getTryOnHistory
);

// Check remaining preview generations
router.get(
    '/remaining/:customizationId',
    authMiddleware,
    getRemainingGenerations
);

module.exports = router;
