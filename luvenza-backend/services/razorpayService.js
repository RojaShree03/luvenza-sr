const crypto = require('crypto');
const https = require('https');

const RAZORPAY_API_BASE = 'https://api.razorpay.com/v1';

const request = (method, path, body) => new Promise((resolve, reject) => {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
        const error = new Error('Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
        error.code = 'RAZORPAY_NOT_CONFIGURED';
        return reject(error);
    }

    const payload = body ? JSON.stringify(body) : '';
    const authorization = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    const req = https.request(`${RAZORPAY_API_BASE}${path}`, {
        method,
        headers: {
            Authorization: `Basic ${authorization}`,
            Accept: 'application/json',
            ...(payload && {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload)
            })
        },
        timeout: 15000
    }, (res) => {
        let responseBody = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { responseBody += chunk; });
        res.on('end', () => {
            let parsed;
            try {
                parsed = responseBody ? JSON.parse(responseBody) : {};
            } catch {
                return reject(new Error('Razorpay returned an invalid response'));
            }

            if (res.statusCode < 200 || res.statusCode >= 300) {
                const error = new Error(parsed.error?.description || 'Razorpay request failed');
                error.statusCode = res.statusCode;
                return reject(error);
            }
            resolve(parsed);
        });
    });

    req.on('timeout', () => {
        const error = new Error('Razorpay request timed out');
        error.code = 'ETIMEDOUT';
        req.destroy(error);
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
});

const createOrder = ({ amount, currency = 'INR', receipt, notes }) => request('POST', '/orders', {
    amount,
    currency,
    receipt,
    notes
});

const findOrdersByReceipt = async (receipt) => {
    if (typeof receipt !== 'string' || !receipt || receipt.length > 40) throw new TypeError('A valid receipt is required');
    const result = await request('GET', `/orders?receipt=${encodeURIComponent(receipt)}&count=100`);
    if (!result || !Array.isArray(result.items)) throw new Error('Razorpay returned an invalid order list');
    return result.items.filter((item) => item.receipt === receipt);
};

const fetchOrder = (orderId) => request('GET', `/orders/${encodeURIComponent(orderId)}`);

const verifyPaymentSignature = ({ orderId, paymentId, signature }) => {
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
        const error = new Error('Razorpay is not configured. Set RAZORPAY_KEY_SECRET.');
        error.code = 'RAZORPAY_NOT_CONFIGURED';
        throw error;
    }

    if (typeof orderId !== 'string' || typeof paymentId !== 'string' ||
        typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) {
        return false;
    }

    const expected = crypto
        .createHmac('sha256', keySecret)
        .update(`${orderId}|${paymentId}`)
        .digest();
    const received = Buffer.from(signature, 'hex');
    return received.length === expected.length && crypto.timingSafeEqual(expected, received);
};

module.exports = { createOrder, findOrdersByReceipt, fetchOrder, verifyPaymentSignature };
