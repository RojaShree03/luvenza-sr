const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/authMiddleware');

const {
    getOutfitSuggestions
} = require('../controllers/aiController');

// Get rule-based outfit suggestions
router.post(
    '/outfit-suggestions',
    authMiddleware,
    getOutfitSuggestions
);

module.exports = router;
