const Payment = require('../models/payment');
const mongoose = require('mongoose');
const { canTransitionPaymentStatus } = require('../utils/paymentState');
const sameId = (left, right) => String(left?._id ?? left) === String(right?._id ?? right);

const assertSameAttemptRequest = (existing, requested) => {
    if (!sameId(existing.customerId, requested.customerId)
        || !sameId(existing.orderId, requested.orderId)
        || existing.idempotencyKey !== requested.idempotencyKey
        || existing.amountMinor !== requested.amountMinor
        || existing.currency !== requested.currency) {
        throw new Error('Idempotency key was already used for a conflicting payment attempt');
    }
    return existing;
};

const createPaymentRepository = (PaymentModel = Payment, clock = () => new Date()) => ({
    async createPaymentAttempt({
        orderId,
        customerId,
        attemptNumber,
        idempotencyKey,
        amountMinor,
        currency = 'INR'
    }) {
        const stableKey = typeof idempotencyKey === 'string' ? idempotencyKey.trim() : '';
        if (stableKey.length < 8 || stableKey.length > 128) {
            throw new TypeError('Idempotency key must contain 8 to 128 characters');
        }
        if (!mongoose.isValidObjectId(orderId) || !mongoose.isValidObjectId(customerId)) {
            throw new TypeError('Valid order and customer IDs are required');
        }
        if (!Number.isSafeInteger(attemptNumber) || attemptNumber < 1) {
            throw new TypeError('attemptNumber must be a positive safe integer');
        }
        if (!Number.isSafeInteger(amountMinor) || amountMinor < 1) {
            throw new TypeError('amountMinor must be a positive safe integer');
        }
        if (currency !== 'INR') {
            throw new TypeError('Only INR payment attempts are supported');
        }
        const request = {
            orderId,
            customerId,
            attemptNumber,
            idempotencyKey: stableKey,
            amountMinor,
            currency,
            status: 'creating'
        };
        const existingForRequest = () => PaymentModel.findOne({
            customerId: request.customerId,
            orderId: request.orderId,
            idempotencyKey: request.idempotencyKey
        });
        const existing = await existingForRequest();
        if (existing) return assertSameAttemptRequest(existing, request);

        const attempt = new PaymentModel(request);
        try {
            await attempt.save();
            return attempt;
        } catch (error) {
            if (error?.code !== 11000) throw error;
            const racedAttempt = await existingForRequest();
            if (!racedAttempt) throw error;
            return assertSameAttemptRequest(racedAttempt, request);
        }
    },

    async transitionPaymentState({
        paymentId,
        nextStatus,
        razorpayOrderId,
        razorpayPaymentId,
    }) {
        const current = await PaymentModel.findOne({ _id: paymentId })
            .select('status __v')
            .lean();
        if (!current) return null;
        if (!canTransitionPaymentStatus(current.status, nextStatus)) {
            throw new Error(`Invalid payment status transition: ${current.status} -> ${nextStatus}`);
        }

        const fields = { status: nextStatus };
        if (nextStatus === 'captured') fields.capturedAt = clock();
        if (nextStatus === 'failed') fields.failedAt = clock();
        if (razorpayOrderId !== undefined) fields.razorpayOrderId = razorpayOrderId;
        if (razorpayPaymentId !== undefined) fields.razorpayPaymentId = razorpayPaymentId;

        return PaymentModel.findOneAndUpdate({
            _id: paymentId,
            status: current.status,
            __v: current.__v
        }, {
            $set: fields
        }, { new: true, runValidators: true });
    }
});

module.exports = {
    ...createPaymentRepository(),
    __testOnly: { createPaymentRepository }
};
