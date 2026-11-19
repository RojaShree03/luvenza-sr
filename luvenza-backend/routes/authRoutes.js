const express = require('express');
const router = express.Router();

const {register} = require('../controllers/authController');

const {registerValidator, validateRequest} = require('../validators/authValidators');

// post/api/auth/register
router.post(
    '/register',
    registerValidator,
    validateRequest,
    register
);

module.exports = router;