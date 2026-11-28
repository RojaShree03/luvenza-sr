'use strict';

const Payment = require('../models/payment');

const REQUIRED_INDEXES = [
    { name: 'uniq_active_payment_per_order', key: { activeOrderKey: 1 }, unique: true, partialFilterExpression: { activeOrderKey: { $type: 'string' } } },
    { name: 'uniq_payment_attempt_number', key: { orderId: 1, attemptNumber: 1 }, unique: true },
    { name: 'uniq_payment_idempotency_key', key: { orderId: 1, idempotencyKey: 1 }, unique: true },
    { name: 'uniq_razorpay_order_id', key: { razorpayOrderId: 1 }, unique: true, sparse: true }
];

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

const verifyPaymentIndexes = async (collection = Payment.collection) => {
    const actual = await collection.listIndexes().toArray();
    for (const required of REQUIRED_INDEXES) {
        const found = actual.find((index) => index.name === required.name);
        if (!found || !same(found.key, required.key) || found.unique !== required.unique ||
            Boolean(found.sparse) !== Boolean(required.sparse) ||
            !same(found.partialFilterExpression || null, required.partialFilterExpression || null)) {
            const error = new Error(`Required payment index is missing or mismatched: ${required.name}`);
            error.code = 'PAYMENT_INDEX_NOT_READY';
            throw error;
        }
    }
    return true;
};

const ensurePaymentIndexes = async () => {
    await Payment.createIndexes();
    return verifyPaymentIndexes();
};

module.exports = { REQUIRED_INDEXES, verifyPaymentIndexes, ensurePaymentIndexes };
