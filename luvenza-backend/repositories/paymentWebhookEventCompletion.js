const PaymentWebhookEvent = require('../models/paymentWebhookEvent');
const { authorizeWebhookQuery } = require('../utils/webhookTransitionAuthorization');

const createClaimCompletion = (EventModel = PaymentWebhookEvent) =>
    ({ eventId, processingToken }) => {
        const query = EventModel.findOneAndUpdate({
            eventId,
            status: 'processing',
            processingToken,
            $expr: { $gt: ['$processingLeaseExpiresAt', '$$NOW'] }
        }, {
            $set: { status: 'processed', processedAt: new Date() },
            $unset: { processingToken: 1, processingLeaseExpiresAt: 1, lastError: 1 }
        }, { new: true, runValidators: true });
        return authorizeWebhookQuery(query, 'complete');
    };

module.exports = {
    completeClaimedWebhookEvent: createClaimCompletion(),
    __testOnly: { createClaimCompletion }
};
