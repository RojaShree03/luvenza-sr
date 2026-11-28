const crypto = require('crypto');
const Order = require('../models/order');
const payments = require('../repositories/paymentRepository');
const razorpayService = require('../services/razorpayService');

const verifyWebhookSignature = (rawBody, signature) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
        const error = new Error('Razorpay webhook is not configured');
        error.code = 'RAZORPAY_WEBHOOK_NOT_CONFIGURED';
        throw error;
    }

    if (!Buffer.isBuffer(rawBody) || typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) {
        return false;
    }

    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
    const received = Buffer.from(signature, 'hex');
    return received.length === expected.length && crypto.timingSafeEqual(expected, received);
};

const receiveRazorpayWebhook = async (req, res) => {
    try {
        const rawBody = req.body;
        const signature = req.get('X-Razorpay-Signature');
        if (!verifyWebhookSignature(rawBody, signature)) {
            return res.status(400).json({ success: false, message: 'Invalid webhook signature' });
        }

        let event;
        try {
            event = JSON.parse(rawBody.toString('utf8'));
        } catch {
            return res.status(400).json({ success: false, message: 'Invalid webhook payload' });
        }

        if (!['payment.captured', 'order.paid', 'payment.failed'].includes(event.event)) {
            return res.status(200).json({ success: true, received: true, processed: false });
        }

        const payment = event.payload?.payment?.entity;
        if (!payment?.id || !payment.order_id || !Number.isSafeInteger(payment.amount) || !payment.currency) {
            return res.status(400).json({ success: false, message: 'Webhook payment data is incomplete' });
        }

        // Resolve ambiguous create responses using the stable receipt before the legacy fallback.
        let attempt = await payments.getByProviderOrder(payment.order_id);
        const legacyOrder = attempt ? null : await Order.findOne({ 'payment.razorpayOrderId': payment.order_id }).select('_id').lean();
        if (!attempt && !legacyOrder) {
            const providerOrder = await razorpayService.fetchOrder(payment.order_id);
            attempt = await payments.getByReceipt(providerOrder.receipt);
            if (attempt && (providerOrder.amount !== attempt.amount || providerOrder.currency !== attempt.currency ||
                payment.amount !== attempt.amount || payment.currency !== attempt.currency)) {
                return res.status(200).json({ success: true, received: true, processed: false });
            }
            if (attempt) attempt = await payments.bindProviderOrder({ receipt: attempt.receipt, providerOrderId: payment.order_id }) || attempt;
        }
        if (attempt && attempt.razorpayOrderId === payment.order_id) {
            const attemptEventId = req.get('x-razorpay-event-id') || event.id;
            if (payment.amount !== attempt.amount || payment.currency !== attempt.currency) {
                console.warn('Ignoring Razorpay webhook with amount or currency mismatch', { paymentId: String(attempt._id) });
                return res.status(200).json({ success: true, received: true, processed: false });
            }
            if (attemptEventId && attempt.webhookEventIds?.includes(attemptEventId)) {
                return res.status(200).json({ success: true, received: true, duplicate: true });
            }
            if (event.event === 'payment.failed') {
                if (attempt.status === 'paid') return res.status(200).json({ success: true, received: true, processed: false });
                const changed = await payments.markProviderFailure({
                    providerOrderId: payment.order_id, paymentId: payment.id,
                    errorCode: payment.error_code, errorDescription: payment.error_description, eventId: attemptEventId
                });
                if (!changed && attemptEventId) await payments.addWebhookEvent(attempt._id, attemptEventId);
                return res.status(200).json({ success: true, received: true, processed: Boolean(changed) });
            }
            if (attempt.status === 'paid') {
                if (attempt.razorpayPaymentId !== payment.id) return res.status(200).json({ success: true, received: true, processed: false });
                if (attemptEventId) await payments.addWebhookEvent(attempt._id, attemptEventId);
                return res.status(200).json({ success: true, received: true, duplicate: true });
            }
            const changed = await payments.markCaptured({ providerOrderId: payment.order_id, paymentId: payment.id, verifiedAt: new Date(), eventId: attemptEventId });
            if (changed) return res.status(200).json({ success: true, received: true, processed: true });
            const latest = await payments.getByProviderOrder(payment.order_id);
            if (latest?.status === 'paid' && latest.razorpayPaymentId === payment.id) {
                if (attemptEventId) await payments.addWebhookEvent(latest._id, attemptEventId);
                return res.status(200).json({ success: true, received: true, duplicate: true });
            }
            return res.status(200).json({ success: true, received: true, processed: false });
        }

        const order = await Order.findOne({ 'payment.razorpayOrderId': payment.order_id });
        if (!order) {
            // A retry can arrive before the provider order ID has finished saving locally.
            return res.status(500).json({ success: false, message: 'Matching order is not available yet' });
        }

        const eventId = req.get('x-razorpay-event-id') || event.id;
        if (eventId && order.payment?.webhookEventIds?.includes(eventId)) {
            return res.status(200).json({ success: true, received: true, duplicate: true });
        }

        const expectedAmount = Math.round(Number(order.totalAmount) * 100);
        const expectedCurrency = order.payment?.currency || 'INR';
        if (payment.amount !== expectedAmount || payment.currency !== expectedCurrency) {
            console.warn('Ignoring Razorpay webhook with amount or currency mismatch', {
                orderId: order._id.toString(), event: event.event
            });
            return res.status(200).json({ success: true, received: true, processed: false });
        }

        if (order.payment?.status === 'paid') {
            if (order.payment.razorpayPaymentId === payment.id) {
                if (eventId) {
                    await Order.updateOne(
                        { _id: order._id },
                        { $addToSet: { 'payment.webhookEventIds': eventId } }
                    );
                }
                return res.status(200).json({ success: true, received: true, duplicate: true });
            }
            console.warn('Ignoring a second captured payment for an already-paid order', {
                orderId: order._id.toString(), paymentId: payment.id
            });
            return res.status(200).json({ success: true, received: true, processed: false });
        }

        const setFields = {};
        if (event.event === 'payment.captured' || event.event === 'order.paid') {
            setFields['payment.status'] = 'paid';
            setFields['payment.razorpayPaymentId'] = payment.id;
            setFields['payment.verifiedAt'] = new Date();
        } else if (event.event === 'payment.failed') {
            setFields['payment.status'] = 'failed';
            setFields['payment.razorpayPaymentId'] = payment.id;
            setFields['payment.errorCode'] = payment.error_code || undefined;
            setFields['payment.errorDescription'] = payment.error_description || undefined;
        }

        const update = { $set: setFields };
        if (eventId) update.$addToSet = { 'payment.webhookEventIds': eventId };
        const filters = { _id: order._id, 'payment.status': { $ne: 'paid' } };
        const result = await Order.updateOne(filters, update);

        // A concurrent captured event or the checkout callback may have committed first.
        if (result.modifiedCount === 0) {
            const latest = await Order.findById(order._id).select('payment.status payment.razorpayPaymentId');
            if (latest?.payment?.status === 'paid' && latest.payment.razorpayPaymentId === payment.id) {
                if (eventId) await Order.updateOne({ _id: order._id }, { $addToSet: { 'payment.webhookEventIds': eventId } });
                return res.status(200).json({ success: true, received: true, duplicate: true });
            }
            return res.status(200).json({ success: true, received: true, processed: false });
        }

        return res.status(200).json({ success: true, received: true, processed: true });
    } catch (error) {
        if (error.code === 'RAZORPAY_WEBHOOK_NOT_CONFIGURED') {
            console.error(error.message);
            return res.status(503).json({ success: false, message: 'Payment webhook is not configured' });
        }
        console.error('Razorpay webhook processing failed:', error.message);
        return res.status(500).json({ success: false, message: 'Unable to process payment webhook' });
    }
};

module.exports = { receiveRazorpayWebhook };
