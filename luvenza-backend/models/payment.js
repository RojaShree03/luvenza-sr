'use strict';

const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Orders', required: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    attemptNumber: { type: Number, required: true, min: 1 },
    idempotencyKey: { type: String, required: true, maxlength: 128 },
    receipt: { type: String, required: true, maxlength: 40 },
    activeOrderKey: { type: String, default: undefined },
    leaseToken: { type: String, required: true },
    leaseExpiresAt: { type: Date, required: true },
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, required: true, enum: ['INR'] },
    status: { type: String, enum: ['initiating', 'ambiguous', 'created', 'paid', 'failed', 'cancelled'], default: 'initiating', required: true },
    razorpayOrderId: { type: String, default: undefined },
    razorpayPaymentId: { type: String, default: undefined },
    lastFailedPaymentId: { type: String, default: undefined },
    verifiedAt: Date,
    webhookEventIds: { type: [String], default: [] },
    errorCode: String,
    errorDescription: String
}, { timestamps: true, optimisticConcurrency: true });

paymentSchema.index({ activeOrderKey: 1 }, {
    name: 'uniq_active_payment_per_order',
    unique: true,
    partialFilterExpression: { activeOrderKey: { $type: 'string' } }
});
paymentSchema.index({ orderId: 1, attemptNumber: 1 }, { name: 'uniq_payment_attempt_number', unique: true });
paymentSchema.index({ orderId: 1, idempotencyKey: 1 }, { name: 'uniq_payment_idempotency_key', unique: true });
paymentSchema.index({ razorpayOrderId: 1 }, { name: 'uniq_razorpay_order_id', unique: true, sparse: true });

module.exports = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);
