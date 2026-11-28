const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/authMiddleware');

const {
    getProfile,
    getDashboardOverview,
    createProfile,
    updateProfile,
    deleteProfile
} = require('../controllers/userController');

router.get('/profile', authMiddleware, getProfile);
router.get('/dashboard/overview', authMiddleware, getDashboardOverview);
router.post('/profile', authMiddleware, createProfile);
router.put('/profile', authMiddleware, updateProfile);
router.delete('/profile', authMiddleware, deleteProfile);

module.exports = router;