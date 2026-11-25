const { randomUUID } = require('node:crypto');
const { isDeepStrictEqual } = require('node:util');
const PaymentWebhookEvent = require('../models/paymentWebhookEvent');
const { authorizeWebhookQuery } = require('../utils/webhookTransitionAuthorization');

const DEFAULT_WEBHOOK_LEASE_MS = 60 * 1000;

const sanitizeError = error => String(error?.message || error || 'Webhook processing failed')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/(secret|authorization|token|signature|password|api[_ -]?key)\s*[:=]\s*[^,\s]+/gi,
        '$1=[redacted]')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 500);

const createPaymentWebhookEventRepository = (EventModel = PaymentWebhookEvent) => {
    const claimEvent = async ({ eventId, retryOnly = false } = {}) => {
        if (typeof eventId !== 'string' || eventId.trim().length === 0) {
            throw new TypeError('A webhook event ID is required');
        }
        const processingToken = randomUUID();
        const eligible = retryOnly
            ? [{ status: 'failed' }]
            : [
                { status: 'pending' },
                { status: 'failed' },
                {
                    status: 'processing',
                    $or: [
                        { processingLeaseExpiresAt: { $exists: false } },
                        { $expr: { $lte: ['$processingLeaseExpiresAt', '$$NOW'] } }
                    ]
                }
            ];
        const query = EventModel.findOneAndUpdate({ eventId: eventId.trim(), $or: eligible }, [
            {
                $set: {
                    status: 'processing',
                    processingToken,
                    processingLeaseExpiresAt: { $add: ['$$NOW', DEFAULT_WEBHOOK_LEASE_MS] },
                    attemptCount: { $add: [{ $ifNull: ['$attemptCount', 0] }, 1] },
                    __v: { $add: [{ $ifNull: ['$__v', 0] }, 1] }
                }
            },
            { $unset: 'lastError' }
        ], { new: true, runValidators: true });

        const event = await authorizeWebhookQuery(query, 'claim');
        return event ? { event, processingToken } : null;
    };

    const failClaim = async ({ eventId, processingToken, error }) => {
        const query = EventModel.findOneAndUpdate({
            eventId,
            status: 'processing',
            processingToken,
            $expr: { $gt: ['$processingLeaseExpiresAt', '$$NOW'] }
        }, {
            $set: { status: 'failed', lastError: sanitizeError(error) },
            $unset: { processingToken: 1, processingLeaseExpiresAt: 1 }
        }, { new: true, runValidators: true });
        return authorizeWebhookQuery(query, 'fail');
    };

    const createVerifiedWebhookEvent = async ({
        eventId,
        eventType,
        payload,
        signatureVerifiedAt,
        receivedAt
    }) => {
        const candidate = new EventModel({
            eventId: typeof eventId === 'string' ? eventId.trim() : eventId,
            eventType: typeof eventType === 'string' ? eventType.trim() : eventType,
            payload,
            signatureVerifiedAt,
            ...(receivedAt ? { receivedAt } : {}),
            status: 'pending',
            attemptCount: 0
        });
        await candidate.validate();

        const findExisting = () => EventModel.findOne({ eventId: candidate.eventId });
        const returnCompatible = existing => {
            if (existing.eventType !== candidate.eventType
                || !isDeepStrictEqual(existing.payload, candidate.payload)) {
                throw new Error('Webhook event ID was repeated with conflicting event data');
            }
            return existing;
        };

        const existing = await findExisting();
        if (existing) return returnCompatible(existing);
        try {
            await candidate.save();
            return candidate;
        } catch (error) {
            if (error?.code !== 11000) throw error;
            const racedEvent = await findExisting();
            if (!racedEvent) throw error;
            return returnCompatible(racedEvent);
        }
    };

    return {
        createVerifiedWebhookEvent,
        claimWebhookEvent: options => claimEvent(options),
        retryWebhookEvent: options => claimEvent({ ...options, retryOnly: true }),
        failWebhookEvent: failClaim
    };
};

module.exports = {
    DEFAULT_WEBHOOK_LEASE_MS,
    ...createPaymentWebhookEventRepository(),
    __testOnly: { createPaymentWebhookEventRepository },
    sanitizeError
};
