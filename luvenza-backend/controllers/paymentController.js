const mongoose = require('mongoose');
const payments = require('../repositories/paymentRepository');
const razorpayService = require('../services/razorpayService');
const { initiatePayment: runInitiation } = require('../services/paymentInitiationService');

const initiatePayment = async (req, res) => {
    try {
        const { orderId } = req.params;
        if (!mongoose.isValidObjectId(orderId)) {
            return res.status(400).json({ success: false, message: 'Invalid order ID' });
        }
        const idempotencyKey = req.get('Idempotency-Key');
        if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9._:-]{8,128}$/.test(idempotencyKey)) {
            return res.status(400).json({ success: false, message: 'A valid Idempotency-Key header is required' });
        }
        const result = await runInitiation({ orderId, customerId: req.user._id, idempotencyKey });
        if (result.body.payment) result.body.payment.keyId = process.env.RAZORPAY_KEY_ID;
        return res.status(result.httpStatus).json(result.body);
    } catch (error) {
        console.error('Payment initiation failed:', error.message);
        const status = error.code === 'RAZORPAY_NOT_CONFIGURED' ? 503 : 502;
        return res.status(status).json({
            success: false,
            message: status === 503 ? 'Payment service is not configured' : 'Unable to initiate payment'
        });
    }
};

const verifyPayment = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { razorpay_order_id: razorpayOrderId, razorpay_payment_id: razorpayPaymentId, razorpay_signature: razorpaySignature } = req.body || {};

        if (!mongoose.isValidObjectId(orderId)) {
            return res.status(400).json({ success: false, message: 'Invalid order ID' });
        }
        if (typeof razorpayOrderId !== 'string' || typeof razorpayPaymentId !== 'string' || typeof razorpaySignature !== 'string') {
            return res.status(400).json({ success: false, message: 'Razorpay payment details are required' });
        }

        const order = await payments.getOwnedOrder(orderId, req.user._id);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        const payment = await payments.getByProviderOrder(razorpayOrderId);
        if (!payment && order.payment?.razorpayOrderId === razorpayOrderId) {
            const isLegacySignatureValid = razorpayService.verifyPaymentSignature({ orderId: razorpayOrderId, paymentId: razorpayPaymentId, signature: razorpaySignature });
            if (!isLegacySignatureValid) return res.status(400).json({ success: false, message: 'Invalid payment signature' });
            if (order.payment.status === 'paid') {
                if (order.payment.razorpayPaymentId !== razorpayPaymentId) return res.status(409).json({ success: false, message: 'A different payment is already recorded for this order' });
                return res.status(200).json({ success: true, message: 'Payment already verified', payment: { status: 'paid', paymentId: razorpayPaymentId, orderId: order._id } });
            }
            if (order.status === 'cancelled') return res.status(409).json({ success: false, message: 'Cancelled orders cannot be paid' });
            const legacyUpdated = await payments.markLegacyCaptured({ orderId: order._id, providerOrderId: razorpayOrderId, paymentId: razorpayPaymentId, verifiedAt: new Date() });
            if (!legacyUpdated) return res.status(409).json({ success: false, message: 'Payment state changed; verification was not applied' });
            return res.status(200).json({ success: true, message: 'Payment verified successfully', payment: { status: 'paid', paymentId: razorpayPaymentId, orderId: order._id } });
        }
        if (!payment || String(payment.orderId) !== String(order._id)) {
            return res.status(400).json({ success: false, message: 'Payment does not match this order' });
        }

        const isValid = razorpayService.verifyPaymentSignature({
            orderId: payment.razorpayOrderId,
            paymentId: razorpayPaymentId,
            signature: razorpaySignature
        });
        if (!isValid) {
            return res.status(400).json({ success: false, message: 'Invalid payment signature' });
        }

        if (payment.status === 'paid') {
            if (payment.razorpayPaymentId !== razorpayPaymentId) {
                return res.status(409).json({ success: false, message: 'A different payment is already recorded for this order' });
            }
            return res.status(200).json({
                success: true,
                message: 'Payment already verified',
                payment: { status: payment.status, paymentId: payment.razorpayPaymentId, orderId: order._id }
            });
        }

        if (order.status === 'cancelled') {
            return res.status(409).json({ success: false, message: 'Cancelled orders cannot be paid' });
        }

        const updated = await payments.markCaptured({ providerOrderId: razorpayOrderId, paymentId: razorpayPaymentId, verifiedAt: new Date() });
        if (!updated) {
            const current = await payments.getByProviderOrder(razorpayOrderId);
            if (current?.status !== 'paid' || current.razorpayPaymentId !== razorpayPaymentId) {
                return res.status(409).json({ success: false, message: 'Payment state changed; verification was not applied' });
            }
        }

        return res.status(200).json({
            success: true,
            message: 'Payment verified successfully',
            payment: { status: 'paid', paymentId: razorpayPaymentId, orderId: order._id }
        });
    } catch (error) {
        console.error('Payment verification failed:', error.message);
        const status = error.code === 'RAZORPAY_NOT_CONFIGURED' ? 503 : 500;
        return res.status(status).json({
            success: false,
            message: status === 503 ? 'Payment service is not configured' : 'Unable to verify payment'
        });
    }
};
module.exports = { initiatePayment, verifyPayment };
