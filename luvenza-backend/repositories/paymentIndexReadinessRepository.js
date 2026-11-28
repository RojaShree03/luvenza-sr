const Payment = require('../models/payment');
const PaymentWebhookEvent = require('../models/paymentWebhookEvent');
const { verifyPaymentIndexes } = require('../config/paymentIndexReadiness');

// Exposes only the startup index check, never the collections themselves.
const verifyPaymentIndexReadiness = () => verifyPaymentIndexes(
    Payment.collection,
    PaymentWebhookEvent.collection
);

module.exports = { verifyPaymentIndexReadiness };
