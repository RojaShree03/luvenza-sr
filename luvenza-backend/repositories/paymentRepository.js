'use strict';

const Payment = require('../models/payment');
const Order = require('../models/order');

const duplicateKey = (error) => error?.code === 11000;
const getOwnedOrder = (orderId, customerId) => Order.findOne({ _id: orderId, customerId });

const getByIdempotencyKey = (orderId, idempotencyKey) => Payment.findOne({ orderId, idempotencyKey });
const getActiveForOrder = (orderId) => Payment.findOne({ activeOrderKey: String(orderId) });
const getByReceipt = (receipt) => Payment.findOne({ receipt });
const getByProviderOrder = (razorpayOrderId) => Payment.findOne({ razorpayOrderId });
const markLegacyCaptured = ({ orderId, providerOrderId, paymentId, verifiedAt }) => Order.findOneAndUpdate(
    { _id: orderId, 'payment.razorpayOrderId': providerOrderId, 'payment.status': { $ne: 'paid' }, status: { $ne: 'cancelled' } },
    { $set: { 'payment.status': 'paid', 'payment.razorpayPaymentId': paymentId, 'payment.verifiedAt': verifiedAt } },
    { new: true }
);
const bindProviderOrder = ({ receipt, providerOrderId }) => Payment.findOneAndUpdate(
    { receipt, activeOrderKey: { $type: 'string' }, status: { $in: ['initiating', 'ambiguous'] }, $or: [{ razorpayOrderId: { $exists: false } }, { razorpayOrderId: providerOrderId }] },
    { $set: { razorpayOrderId: providerOrderId } }, { new: true }
);
const addWebhookEvent = (paymentId, eventId) => Payment.updateOne({ _id: paymentId }, { $addToSet: { webhookEventIds: eventId } });
const getLatestAttemptNumber = async (orderId) => {
    const latest = await Payment.findOne({ orderId }).sort({ attemptNumber: -1 }).select('attemptNumber').lean();
    return latest?.attemptNumber || 0;
};

const insertReservation = (fields) => Payment.create(fields);
const claimExpiredReservation = ({ paymentId, previousLeaseToken, leaseToken, leaseExpiresAt, now }) => Payment.findOneAndUpdate(
    { _id: paymentId, activeOrderKey: { $type: 'string' }, leaseToken: previousLeaseToken, leaseExpiresAt: { $lte: now }, status: { $in: ['initiating', 'ambiguous'] } },
    { $set: { leaseToken, leaseExpiresAt, status: 'initiating' } },
    { new: true }
);
const updateOwnedAttempt = (paymentId, leaseToken, update) => Payment.findOneAndUpdate(
    { _id: paymentId, leaseToken, activeOrderKey: { $type: 'string' } }, update, { new: true, runValidators: true }
);
const releaseActiveAttempt = (paymentId, leaseToken, status, fields = {}) => Payment.findOneAndUpdate(
    { _id: paymentId, leaseToken, activeOrderKey: { $type: 'string' }, status: { $ne: 'paid' } },
    { $set: { ...fields, status }, $unset: { activeOrderKey: 1 } },
    { new: true, runValidators: true }
);
const markCaptured = async ({ providerOrderId, paymentId, verifiedAt, eventId }) => {
    const update = {
        $set: { status: 'paid', razorpayPaymentId: paymentId, verifiedAt },
        $unset: { activeOrderKey: 1 }
    };
    if (eventId) update.$addToSet = { webhookEventIds: eventId };
    let payment = await Payment.findOneAndUpdate(
        { razorpayOrderId: providerOrderId, status: { $ne: 'paid' } }, update,
        { new: true, runValidators: true }
    );
    if (!payment) {
        const existing = await Payment.findOne({ razorpayOrderId: providerOrderId, status: 'paid', razorpayPaymentId: paymentId });
        if (!existing) return null;
        payment = existing;
        if (eventId) await Payment.updateOne({ _id: payment._id }, { $addToSet: { webhookEventIds: eventId } });
    }
    await Order.updateOne(
        { _id: payment.orderId },
        { $set: { 'payment.status': 'paid', 'payment.razorpayOrderId': providerOrderId, 'payment.razorpayPaymentId': paymentId, 'payment.currency': payment.currency, 'payment.verifiedAt': verifiedAt }, $unset: { 'payment.activeAttemptId': 1 } }
    );
    return payment;
};

const markProviderFailure = async ({ providerOrderId, paymentId, errorCode, errorDescription, eventId }) => {
    const update = {
        $set: { lastFailedPaymentId: paymentId, errorCode, errorDescription }
    };
    if (eventId) update.$addToSet = { webhookEventIds: eventId };
    const payment = await Payment.findOneAndUpdate(
        { razorpayOrderId: providerOrderId, status: { $ne: 'paid' } }, update,
        { new: true, runValidators: true }
    );
    if (payment) await Order.updateOne(
        { _id: payment.orderId, 'payment.status': { $ne: 'paid' } },
        { $set: { 'payment.status': 'pending', 'payment.razorpayOrderId': providerOrderId, 'payment.errorCode': errorCode, 'payment.errorDescription': errorDescription } }
    );
    return payment;
};

const attachReservationToOrder = async (attempt) => {
    let order = await Order.findOneAndUpdate({
        _id: attempt.orderId, customerId: attempt.customerId, status: { $ne: 'cancelled' },
        'payment.status': { $ne: 'paid' }, 'payment.activeAttemptId': { $exists: false }
    }, { $set: { 'payment.activeAttemptId': attempt._id } }, { new: true });
    if (order) return true;
    let current = await Order.findById(attempt.orderId).select('status payment.activeAttemptId payment.status').lean();
    if (current?.payment?.activeAttemptId) {
        const previous = await Payment.findById(current.payment.activeAttemptId).select('status activeOrderKey razorpayOrderId razorpayPaymentId currency verifiedAt').lean();
        if (previous?.status === 'paid') {
            await Order.updateOne({ _id: attempt.orderId, 'payment.activeAttemptId': current.payment.activeAttemptId }, {
                $set: { 'payment.status': 'paid', 'payment.razorpayOrderId': previous.razorpayOrderId, 'payment.razorpayPaymentId': previous.razorpayPaymentId, 'payment.currency': previous.currency, 'payment.verifiedAt': previous.verifiedAt },
                $unset: { 'payment.activeAttemptId': 1 }
            });
            return false;
        }
        if (!previous || !previous.activeOrderKey) {
            await Order.updateOne({ _id: attempt.orderId, 'payment.activeAttemptId': current.payment.activeAttemptId }, { $unset: { 'payment.activeAttemptId': 1 } });
            order = await Order.findOneAndUpdate({
                _id: attempt.orderId, customerId: attempt.customerId, status: { $ne: 'cancelled' },
                'payment.status': { $ne: 'paid' }, 'payment.activeAttemptId': { $exists: false }
            }, { $set: { 'payment.activeAttemptId': attempt._id } }, { new: true });
            if (order) return true;
            current = await Order.findById(attempt.orderId).select('status payment.activeAttemptId payment.status').lean();
        }
    }
    return String(current?.payment?.activeAttemptId || '') === String(attempt._id) && current.status !== 'cancelled' && current.payment?.status !== 'paid';
};
const releaseOrderReservation = (orderId, attemptId, status) => Order.updateOne(
    { _id: orderId, 'payment.activeAttemptId': attemptId, 'payment.status': { $ne: 'paid' } },
    { $set: { 'payment.status': status }, $unset: { 'payment.activeAttemptId': 1 } }
);
const markProviderCreated = async ({ paymentId, leaseToken, providerOrder }) => {
    const attempt = await Payment.findOne({ _id: paymentId, leaseToken, activeOrderKey: { $type: 'string' } }).lean();
    if (!attempt) return null;
    const orderResult = await Order.updateOne(
        { _id: attempt.orderId, 'payment.activeAttemptId': attempt._id, status: { $ne: 'cancelled' }, 'payment.status': { $ne: 'paid' } },
        { $set: { 'payment.status': 'pending', 'payment.razorpayOrderId': providerOrder.id, 'payment.currency': providerOrder.currency } }
    );
    if (orderResult.matchedCount !== 1) return null;
    return Payment.findOneAndUpdate(
        { _id: paymentId, leaseToken, activeOrderKey: { $type: 'string' }, status: { $ne: 'paid' } },
        { $set: { status: 'created', razorpayOrderId: providerOrder.id, leaseExpiresAt: new Date('9999-12-31T23:59:59.999Z') } },
        { new: true, runValidators: true }
    );
};
const cancelIfNoActivePayment = async (orderId) => {
    const current = await Order.findById(orderId).select('payment.activeAttemptId').lean();
    if (current?.payment?.activeAttemptId) {
        const active = await Payment.findById(current.payment.activeAttemptId).select('status activeOrderKey').lean();
        if (active?.status === 'paid') {
            const paidAttempt = await Payment.findById(current.payment.activeAttemptId).select('razorpayOrderId razorpayPaymentId currency verifiedAt').lean();
            await Order.updateOne({ _id: orderId, 'payment.activeAttemptId': current.payment.activeAttemptId }, {
                $set: { 'payment.status': 'paid', 'payment.razorpayOrderId': paidAttempt.razorpayOrderId, 'payment.razorpayPaymentId': paidAttempt.razorpayPaymentId, 'payment.currency': paidAttempt.currency, 'payment.verifiedAt': paidAttempt.verifiedAt },
                $unset: { 'payment.activeAttemptId': 1 }
            });
            return null;
        }
        if (!active || !active.activeOrderKey) {
            await Order.updateOne({ _id: orderId, 'payment.activeAttemptId': current.payment.activeAttemptId }, { $unset: { 'payment.activeAttemptId': 1 } });
        }
    }
    return Order.findOneAndUpdate(
        { _id: orderId, status: { $nin: ['delivered', 'cancelled'] }, 'payment.status': { $ne: 'paid' }, 'payment.activeAttemptId': { $exists: false } },
        { $set: { status: 'cancelled' } }, { new: true }
    );
};

module.exports = {
    duplicateKey, getOwnedOrder, getByIdempotencyKey, getActiveForOrder, getByReceipt, getByProviderOrder, getLatestAttemptNumber,
    insertReservation, claimExpiredReservation, updateOwnedAttempt, releaseActiveAttempt,
    markCaptured, markProviderFailure, attachReservationToOrder, releaseOrderReservation, cancelIfNoActivePayment,
    bindProviderOrder, addWebhookEvent, markProviderCreated, markLegacyCaptured
};
