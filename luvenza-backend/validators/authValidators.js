const { body, validationResult } = require('express-validator');

// registration validation rules
const registerValidator = [
    body('name')
        .trim()
        .notEmpty()
        .withMessage('Name is required'),

    body('email')
        .trim()
        .notEmpty()
        .withMessage('Email is required')
        .isEmail()
        .withMessage('Enter valid email address')
        .normalizeEmail(),

    body('phone')
        .trim()
        .notEmpty()
        .withMessage('Phone Number is required')
        .isMobilePhone('en-IN')
        .withMessage('Enter a valid Indian Phone Number'),

    body('password')
        .notEmpty()
        .withMessage('Password is required')
        .isLength({ min: 8 })
        .withMessage('password must be at least 8 characters long')
        .matches(/[A-Z]/)
        .withMessage('Password must contain at least one uppercase letter')
        .matches(/[a-z]/)
        .withMessage('Password must contain at least one lowercase letter')
        .matches(/[0-9]/)
        .withMessage('Password must contain at least one number')
        .matches(/[^A-Za-z0-9]/)
        .withMessage('Password must contain at least one special symbol'),
]

// middleware to check validation errors
const validateRequest = (req, res, next) => {
    const errors = validationResult(req)

    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            message: 'Validation Failed',
            errors: errors.array().map(error => ({
                field: error.path,
                message: error.msg
            }))
        });
    }
    next();
};

module.exports = {
    registerValidator,
    validateRequest
};