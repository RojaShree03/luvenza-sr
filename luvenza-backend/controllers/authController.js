const User = require('../models/user')
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const generateToken = require('../utils/generateToken');
const generateOTP = require('../utils/generateOTP');
const sendEmail = require('../utils/sendEmail');

// register customer
const register = async (req, res) => {

    try {
        // get reg data
        const { name, email, phone, password } = req.body

        // check email is already exists
        const existingUser = await User.findOne({ email });

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'Email is already exists'
            });
        }
        // hash pass
        const hashedPassword = await bcrypt.hash(password, 12);

        // create new customer
        const newUser = await User.create({
            name,
            email,
            phone,
            password: hashedPassword,
            role: 'customer'
        });

        // res sending without password
        return res.status(201).json({
            success: true,
            message: 'Registration Successful',
            user: {
                id: newUser._id,
                name: newUser.name,
                email: newUser.email,
                phone: newUser.phone,
                role: newUser.role
            }
        });

    } catch (error) {
        // duplicate email db error
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: 'Email is already registered'
            });

        }
        console.log('Registration Error: ', error);

        return res.status(500).json({
            success: false,
            message: 'Internal server Error'
        });
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User with this email is not found! Would you like to Signup ?'
            });
        }

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Login Successful',
            token: generateToken(user._id),
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role
            }
        });
    } catch (error) {
        console.log('Login Error: ', error);

        return res.status(500).json({
            success: false,
            message: 'Internal server Error'
        });
    }
};

const logout = (req, res) => {
    res.clearCookie('token');

    return res.status(200).json({
        success: true,
        message: 'Logout Successful'
    });
};

const getCurrentUser = (req, res) => {
    return res.status(200).json({
        success: true,
        user: {
            id: req.user._id,
            name: req.user.name,
            email: req.user.email,
            phone: req.user.phone,
            role: req.user.role,
            isLoggedIn: true
        }
    });
};


const forgotPassword = async (req, res) => {

    try {
        // 1. Get email from request
        const { email } = req.body;

        // 2. Find user in MongoDB
        const user = await User.findOne({ email });

        // Return a generic response to avoid revealing
        // whether an email is registered
        if (!user) {
            return res.status(200).json({
                success: true,
                message: 'If the email is registered, an OTP has been sent.'
            });
        }

        // 3. Generate OTP
        const { otp, hashedOTP, expiry } = generateOTP();

        // 4. Store hashed OTP and expiry
        user.resetPasswordOTP = hashedOTP;
        user.resetPasswordOTPExpiry = expiry;

        // Reset security counters for new OTP
        user.resetPasswordOTPAttempts = 0;
        user.resetPasswordOTPBlockedUntil = null;

        await user.save();

        // 5. Send OTP through Gmail SMTP
        try {
            await sendEmail({
                email: user.email,
                subject: 'Luvenza - Password Reset OTP',
                html: `
                    <div style="font-family: Arial, sans-serif;">
                        <h2>Luvenza Password Reset</h2>

                        <p>You requested to reset your password.</p>

                        <h1 style="letter-spacing: 8px;">
                            ${otp}
                        </h1>

                        <p>This OTP expires in 5 minutes.</p>

                        <p>If you did not request this, please ignore this email.</p>
                    </div>
                `
            });

        } catch (emailError) {

            // Clear OTP if email delivery fails
            user.resetPasswordOTP = null;
            user.resetPasswordOTPExpiry = null;
            user.resetPasswordOTPAttempts = 0;
            user.resetPasswordOTPBlockedUntil = null;

            await user.save();

            throw emailError;
        }

        // 6. Send response
        return res.status(200).json({
            success: true,
            message: 'If the email is registered, an OTP has been sent.'
        });

    } catch (error) {

        console.error('Forgot Password Error:', error.message);

        return res.status(500).json({
            success: false,
            message: 'Unable to process password reset request'
        });
    }
};


const resetPassword = async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;

        // 1. Validate password strength
        const strongPassword =
            /^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}$/;

        if (!strongPassword.test(newPassword || '')) {
            return res.status(400).json({
                success: false,
                message: 'Password must contain at least 8 characters, one uppercase, one lowercase, one number and one special symbol'
            });
        }

        // 2. Find user
        const user = await User.findOne({ email });

        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email or OTP'
            });
        }

        // 3. Check OTP availability
        if (!user.resetPasswordOTP || !user.resetPasswordOTPExpiry) {
            return res.status(400).json({
                success: false,
                message: 'No password reset request found'
            });
        }

        // 4. Check temporary block
        if (
            user.resetPasswordOTPBlockedUntil &&
            user.resetPasswordOTPBlockedUntil > new Date()
        ) {
            return res.status(429).json({
                success: false,
                message: 'Too many incorrect attempts. Try again after 15 minutes.'
            });
        }

        // 5. Check OTP expiry
        if (user.resetPasswordOTPExpiry <= new Date()) {
            return res.status(400).json({
                success: false,
                message: 'OTP expired. Please request a new OTP.'
            });
        }

        // 6. Validate OTP format
        if (!/^\d{6}$/.test(otp || '')) {
            return res.status(400).json({
                success: false,
                message: 'OTP must contain exactly 6 digits'
            });
        }

        // 7. Hash received OTP
        const hashedOTP = crypto
            .createHash('sha256')
            .update(otp)
            .digest();

        const storedOTP = Buffer.from(
            user.resetPasswordOTP,
            'hex'
        );

        // 8. Secure comparison
        const isOTPValid =
            storedOTP.length === hashedOTP.length &&
            crypto.timingSafeEqual(storedOTP, hashedOTP);

        if (!isOTPValid) {
            user.resetPasswordOTPAttempts =
                (user.resetPasswordOTPAttempts || 0) + 1;

            if (user.resetPasswordOTPAttempts >= 5) {
                user.resetPasswordOTPBlockedUntil =
                    new Date(Date.now() + 15 * 60 * 1000);
            }

            await user.save();

            return res.status(400).json({
                success: false,
                message: 'Invalid OTP',
                remainingAttempts: Math.max(
                    0,
                    5 - user.resetPasswordOTPAttempts
                )
            });
        }

        // 9. Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 12);

        // 10. Update password
        user.password = hashedPassword;

        // 11. Clear OTP and security fields
        user.resetPasswordOTP = null;
        user.resetPasswordOTPExpiry = null;
        user.resetPasswordOTPAttempts = 0;
        user.resetPasswordOTPBlockedUntil = null;

        await user.save();

        return res.status(200).json({
            success: true,
            message: 'Password reset successfully'
        });

    } catch (error) {
        console.error('Reset Password Error:', error);

        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

module.exports = {
    register,
    login,
    logout,
    getCurrentUser,
    forgotPassword,
    resetPassword
};