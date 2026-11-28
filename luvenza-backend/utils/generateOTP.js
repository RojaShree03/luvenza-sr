const crypto = require('crypto');

// Generate a secure 6-digit OTP
const generateOTP = () => {

    const otp = crypto.randomInt(100000, 1000000).toString();

    // Hash OTP before storing in MongoDB
    const hashedOTP = crypto
        .createHash('sha256')
        .update(otp)
        .digest('hex');

    // OTP expiry: 5 minutes
    const expiry = new Date(Date.now() + 5 * 60 * 1000);

    return {
        otp,
        hashedOTP,
        expiry
    };
};

module.exports = generateOTP;