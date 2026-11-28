'use strict';

const required = ['MONGODB_URI', 'JWT_SECRET', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'];

const loadRuntimeConfig = (env = process.env) => {
    const missing = required.filter((key) => typeof env[key] !== 'string' || !env[key].trim());
    if (missing.length) {
        const error = new Error(`Missing required configuration: ${missing.join(', ')}`);
        error.code = 'INVALID_RUNTIME_CONFIG';
        throw error;
    }
    const port = Number(env.PORT || 5000);
    const paymentReservationMs = Number(env.PAYMENT_RESERVATION_MS || 45000);
    if (!Number.isSafeInteger(port) || port <= 0 || port > 65535 || !Number.isSafeInteger(paymentReservationMs) || paymentReservationMs < 30000) {
        const error = new Error('PORT and PAYMENT_RESERVATION_MS must be valid positive integers');
        error.code = 'INVALID_RUNTIME_CONFIG';
        throw error;
    }
    return Object.freeze({
        mongoUri: env.MONGODB_URI.trim(),
        jwtSecret: env.JWT_SECRET,
        razorpayKeyId: env.RAZORPAY_KEY_ID.trim(),
        razorpayKeySecret: env.RAZORPAY_KEY_SECRET,
        razorpayWebhookSecret: env.RAZORPAY_WEBHOOK_SECRET,
        port,
        paymentReservationMs
    });
};

module.exports = { loadRuntimeConfig };
