const {
    DEFAULT_WEBHOOK_LEASE_MS,
    claimWebhookEvent,
    retryWebhookEvent,
    failWebhookEvent
} = require('../repositories/paymentWebhookEventRepository');
const { completeClaimedWebhookEvent } = require('../repositories/paymentWebhookEventCompletion');

const createWebhookProcessor = ({
    fail = failWebhookEvent,
    complete = completeClaimedWebhookEvent
} = {}) => async ({ claim, applyBusinessEffects } = {}) => {
    if (!claim?.event?.eventId || !claim.processingToken || typeof applyBusinessEffects !== 'function') {
        throw new TypeError('A valid claim and business-effects handler are required');
    }

    try {
        await applyBusinessEffects(claim.event.payload);
    } catch (error) {
        const failed = await fail({
            eventId: claim.event.eventId,
            processingToken: claim.processingToken,
            error
        });
        return { status: failed ? 'failed' : 'lease_lost', event: failed };
    }

    const completed = await complete({
        eventId: claim.event.eventId,
        processingToken: claim.processingToken
    });
    return { status: completed ? 'processed' : 'lease_lost', event: completed };
};

module.exports = {
    DEFAULT_WEBHOOK_LEASE_MS,
    claimWebhookEvent,
    retryWebhookEvent,
    failWebhookEvent,
    processClaimedWebhookEvent: createWebhookProcessor(),
    __testOnly: { createWebhookProcessor }
};
