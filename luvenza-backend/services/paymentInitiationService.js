'use strict';

const crypto = require('crypto');
const payments = require('../repositories/paymentRepository');
const razorpay = require('./razorpayService');

const amountToPaise = (amount) => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return null;
    const paise = value * 100;
    const rounded = Math.round(paise);
    if (!Number.isSafeInteger(rounded) || rounded <= 0 || Math.abs(paise - rounded) > 1e-7) return null;
    return rounded;
};

const providerMatches = (providerOrder, attempt) => providerOrder &&
    typeof providerOrder.id === 'string' && providerOrder.id.length > 0 &&
    providerOrder.amount === attempt.amount && providerOrder.currency === attempt.currency &&
    providerOrder.receipt === attempt.receipt;

const resolveProviderOrder = async ({ attempt, razorpay, onCreateAttempt = () => {} }) => {
    let matches;
    try { matches = await razorpay.findOrdersByReceipt(attempt.receipt); }
    catch (error) {
        error.code = error.code || 'PROVIDER_RECONCILIATION_UNAVAILABLE';
        throw error;
    }
    if (matches.length > 1) throw Object.assign(new Error('Multiple provider Orders share the payment receipt'), { code: 'PAYMENT_RECONCILIATION_CONFLICT' });
    let providerOrder = matches[0];
    if (!providerOrder) {
        onCreateAttempt();
        try {
            providerOrder = await razorpay.createOrder({
                amount: attempt.amount, currency: attempt.currency, receipt: attempt.receipt,
                notes: { orderId: String(attempt.orderId), attemptId: String(attempt._id) }
            });
        } catch (createError) {
            // A create timeout or 5xx can mean the provider committed the Order but the response was lost.
            let recovered;
            try { recovered = await razorpay.findOrdersByReceipt(attempt.receipt); }
            catch { throw createError; }
            if (recovered.length === 1) providerOrder = recovered[0];
            else if (recovered.length > 1) throw Object.assign(new Error('Multiple provider Orders share the payment receipt'), { code: 'PAYMENT_RECONCILIATION_CONFLICT' });
            else throw createError;
        }
    }
    if (!providerMatches(providerOrder, attempt)) throw Object.assign(new Error('Provider Order does not match the reserved payment amount, currency, or receipt'), { code: 'PROVIDER_ORDER_MISMATCH' });
    return providerOrder;
};

const publicAttempt = (attempt) => ({
    status: attempt.status,
    paymentId: String(attempt._id),
    orderId: String(attempt.orderId),
    razorpayOrderId: attempt.razorpayOrderId,
    amount: attempt.amount,
    currency: attempt.currency,
    receipt: attempt.receipt
});

const reserve = async ({ order, customerId, idempotencyKey, amount, leaseMs, repository = payments }) => {
    const existing = await repository.getByIdempotencyKey(order._id, idempotencyKey);
    if (existing) {
        if (existing.amount !== amount || existing.currency !== 'INR') return { conflict: 'Idempotency key was already used for different payment details' };
        if (existing.status === 'created') return { attempt: existing, replay: true };
        if (existing.status === 'paid') return { conflict: 'Order is already paid' };
        if (!existing.activeOrderKey) return { conflict: 'This idempotency key belongs to a completed or failed attempt; use a new key' };
        if (existing.leaseExpiresAt > new Date()) return { conflict: 'Payment initiation is already in progress' };
        const leaseToken = crypto.randomUUID();
        const claimed = await repository.claimExpiredReservation({
            paymentId: existing._id, previousLeaseToken: existing.leaseToken, leaseToken,
            leaseExpiresAt: new Date(Date.now() + leaseMs), now: new Date()
        });
        return claimed ? { attempt: claimed, replay: true } : { conflict: 'Payment initiation is already in progress' };
    }

    const active = await repository.getActiveForOrder(order._id);
    if (active) {
        if (active.idempotencyKey === idempotencyKey && active.leaseExpiresAt <= new Date() && ['initiating', 'ambiguous'].includes(active.status)) {
            const leaseToken = crypto.randomUUID();
            const claimed = await repository.claimExpiredReservation({
                paymentId: active._id, previousLeaseToken: active.leaseToken, leaseToken,
                leaseExpiresAt: new Date(Date.now() + leaseMs), now: new Date()
            });
            if (claimed) return { attempt: claimed, replay: true };
        }
        return { conflict: 'Another payment attempt is active for this order' };
    }

    const attemptNumber = await repository.getLatestAttemptNumber(order._id) + 1;
    const leaseToken = crypto.randomUUID();
    const attempt = await repository.insertReservation({
        orderId: order._id, customerId, attemptNumber, idempotencyKey,
        receipt: `l${String(order._id)}_${attemptNumber}`,
        activeOrderKey: String(order._id), leaseToken,
        leaseExpiresAt: new Date(Date.now() + leaseMs), amount, currency: 'INR', status: 'initiating'
    });
    return { attempt, replay: false };
};

const initiatePayment = async ({ orderId, customerId, idempotencyKey, leaseMs = Number(process.env.PAYMENT_RESERVATION_MS || 45000) }) => {
    const order = await payments.getOwnedOrder(orderId, customerId).select('_id customerId totalAmount status payment.status payment.activeAttemptId payment.razorpayOrderId').lean();
    if (!order) return { httpStatus: 404, body: { success: false, message: 'Order not found' } };
    if (order.status === 'cancelled') return { httpStatus: 409, body: { success: false, message: 'Cancelled orders cannot be paid' } };
    if (order.payment?.status === 'paid') return { httpStatus: 409, body: { success: false, message: 'Order is already paid' } };
    const amount = amountToPaise(order.totalAmount);
    if (!amount) return { httpStatus: 400, body: { success: false, message: 'Order amount must be a positive INR amount with no fraction of a paise' } };

    let reservation;
    try {
        reservation = await reserve({ order, customerId, idempotencyKey, amount, leaseMs, repository: payments });
    } catch (error) {
        if (!payments.duplicateKey(error)) throw error;
        const winner = await payments.getByIdempotencyKey(order._id, idempotencyKey) || await payments.getActiveForOrder(order._id);
        if (winner?.status === 'created' && winner.idempotencyKey === idempotencyKey) reservation = { attempt: winner, replay: true };
        else return { httpStatus: 409, body: { success: false, message: 'A payment attempt is already active for this order' } };
    }
    if (reservation.conflict) return { httpStatus: 409, body: { success: false, message: reservation.conflict } };
    let attempt = reservation.attempt;
    if (attempt.status === 'created') return { httpStatus: 200, body: { success: true, payment: publicAttempt(attempt) } };

    if (!(await payments.attachReservationToOrder(attempt))) {
        await payments.releaseActiveAttempt(attempt._id, attempt.leaseToken, 'cancelled');
        return { httpStatus: 409, body: { success: false, message: 'Order cannot accept a payment attempt' } };
    }

    let providerOrder;
    let providerCreateAttempted = false;
    try {
        if (order.payment?.razorpayOrderId) {
            providerOrder = await razorpay.fetchOrder(order.payment.razorpayOrderId);
            if (!providerOrder || providerOrder.amount !== attempt.amount || providerOrder.currency !== attempt.currency ||
                typeof providerOrder.receipt !== 'string' || !providerOrder.receipt || providerOrder.receipt.length > 40) {
                throw Object.assign(new Error('Existing provider Order does not match the local Order'), { code: 'PROVIDER_ORDER_MISMATCH' });
            }
            const adopted = await payments.updateOwnedAttempt(attempt._id, attempt.leaseToken, { $set: { receipt: providerOrder.receipt } });
            if (!adopted) return { httpStatus: 409, body: { success: false, message: 'Payment initiation lease changed; retry with the same idempotency key' } };
            attempt = adopted;
        } else {
            providerOrder = await resolveProviderOrder({ attempt, razorpay, onCreateAttempt: () => { providerCreateAttempted = true; } });
        }
        const saved = await payments.markProviderCreated({ paymentId: attempt._id, leaseToken: attempt.leaseToken, providerOrder });
        if (!saved) return { httpStatus: 409, body: { success: false, message: 'Payment initiation lease changed; retry with the same idempotency key' } };
        attempt = saved;
        return { httpStatus: 200, body: { success: true, payment: publicAttempt(attempt) } };
    } catch (error) {
        const ambiguous = providerCreateAttempted || error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET' || error.statusCode >= 500 ||
            error.code === 'PAYMENT_RECONCILIATION_CONFLICT' || error.code === 'PROVIDER_RECONCILIATION_UNAVAILABLE' || error.code === 'PROVIDER_ORDER_MISMATCH';
        if (ambiguous) {
            await payments.updateOwnedAttempt(attempt._id, attempt.leaseToken, { $set: { status: 'ambiguous', leaseExpiresAt: new Date(Date.now() + leaseMs), errorCode: error.code || 'PROVIDER_AMBIGUOUS' } });
        } else {
            await payments.releaseActiveAttempt(attempt._id, attempt.leaseToken, 'failed', { errorCode: error.code || String(error.statusCode || 'PROVIDER_ERROR') });
            await payments.releaseOrderReservation(order._id, attempt._id, 'failed');
        }
        throw error;
    }
};

module.exports = { initiatePayment, amountToPaise, providerMatches, resolveProviderOrder, reserve };
