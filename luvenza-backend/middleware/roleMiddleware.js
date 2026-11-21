
const authorizeRoles = (...roles) => {

    return (req, res, next) => {

        // Check whether user is authenticated
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: "Authentication required"
            });
        }

        // Check whether user's role is allowed
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: "Access denied. You don't have permission to access this resource."
            });
        }

        // User has permission
        next();
    };

};

module.exports = authorizeRoles;