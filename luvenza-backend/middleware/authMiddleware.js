const jwt = require('jsonwebtoken');
const User = require('../models/user');

const authMiddleware = async (req, res, next) => {
    const authorization = req.headers.authorization;
    const token = req.cookies?.token
        || (authorization && authorization.startsWith('Bearer ')
            ? authorization.slice(7)
            : null);

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
    }

    let payload;
    try {
        payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired token'
        });
    }

    try {
        const user = await User.findById(payload.userId).select('-password');

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired token'
            });
        }

        if (
            user.passwordChangedAt
            && payload.iat <= Math.floor(user.passwordChangedAt.getTime() / 1000)
        ) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired token'
            });
        }

        req.user = user;
        return next();
    } catch (error) {
        console.error('Authentication Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

module.exports = authMiddleware;