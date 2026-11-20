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
    forgotPasswordValidator,
    resetPasswordValidator,
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