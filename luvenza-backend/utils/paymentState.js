const PAYMENT_STATUSES = Object.freeze([
    'creating',
    'created',
    'authorized',
    'captured',
    'failed',
    'needs_review'
]);

const PAYMENT_TRANSITIONS = Object.freeze({
    creating: ['created', 'captured', 'failed', 'needs_review'],
    created: ['authorized', 'captured', 'failed', 'needs_review'],
    authorized: ['captured', 'failed', 'needs_review'],
    captured: [],
    failed: ['needs_review'],
    needs_review: ['captured', 'failed']
});

const WEBHOOK_EVENT_STATUSES = Object.freeze([
    'pending',
    'processing',
    'processed',
    'failed'
]);

const WEBHOOK_EVENT_TRANSITIONS = Object.freeze({
    pending: ['processing'],
    processing: ['processing', 'processed', 'failed'],
    processed: [],
    failed: ['processing']
});

const canTransitionPaymentStatus = (current, next) =>
    PAYMENT_STATUSES.includes(current)
    && PAYMENT_STATUSES.includes(next)
    && (current === next || PAYMENT_TRANSITIONS[current].includes(next));

const canTransitionWebhookEventStatus = (current, next) =>
    WEBHOOK_EVENT_STATUSES.includes(current)
    && WEBHOOK_EVENT_STATUSES.includes(next)
    && WEBHOOK_EVENT_TRANSITIONS[current].includes(next);

module.exports = {
    PAYMENT_STATUSES,
    PAYMENT_TRANSITIONS,
    WEBHOOK_EVENT_STATUSES,
    WEBHOOK_EVENT_TRANSITIONS,
    canTransitionPaymentStatus,
    canTransitionWebhookEventStatus
};
