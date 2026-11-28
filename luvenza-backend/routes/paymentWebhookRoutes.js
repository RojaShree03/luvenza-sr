const express = require('express');
const { receiveRazorpayWebhook } = require('../controllers/paymentWebhookController');

const router = express.Router();
router.post('/', express.raw({ type: 'application/json', limit: '1mb' }), receiveRazorpayWebhook);

module.exports = router;
