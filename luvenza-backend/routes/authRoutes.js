const express = require('express');
const router = express.Router();

const {
    register,
    login,
    logout,
    getCurrentUser,
    forgotPassword,
    resetPassword
} = require('../controllers/authController');

const {
    registerValidator,
    loginValidator,
    validateRequest
} = require('../validators/authValidators');
const authMiddleware = require('../middleware/authMiddleware');

// post/api/auth/register
router.post(
    '/register',
    registerValidator,
    validateRequest,
    register
);

// Forgot password
router.post(
    '/forgot-password',
    forgotPassword
);

// reset password
router.post('/reset-password', resetPassword);

// post/api/auth/login
router.post(
    "/login",
    loginValidator,
    validateRequest,
    login
)

// post/api/auth/logout
router.post('/logout', logout);

// get/api/auth/me
router.get('/me', authMiddleware, getCurrentUser);

module.exports = router;