const mongoose = require('mongoose');
const { isDeepStrictEqual } = require('node:util');
const {
    WEBHOOK_EVENT_STATUSES,
    canTransitionWebhookEventStatus
} = require('../utils/paymentState');
const { getAuthorizedWebhookOperation } = require('../utils/webhookTransitionAuthorization');

const IMMUTABLE_WEBHOOK_AUDIT_FIELDS = [
    'eventId', 'eventType', 'payload', 'signatureVerifiedAt', 'receivedAt'
];

const sanitizeLastError = value => {
    if (value === undefined || value === null) return value;
    return String(value)
        .replace(/[\r\n\t]+/g, ' ')
        .replace(/(secret|authorization|token|signature|password|api[_ -]?key)\s*[:=]\s*[^,\s]+/gi,
            '$1=[redacted]')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim()
        .slice(0, 500);
};

const paymentWebhookEventSchema = new mongoose.Schema({
    eventId: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    eventType: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120
    },
    // Persist only a verified, minimized payload needed by the processor.
    payload: {
        type: mongoose.Schema.Types.Mixed,
        required: true,
        validate: {
            validator: value => value !== null
                && typeof value === 'object'
                && !Array.isArray(value),
            message: 'payload must be a JSON object'
        }
    },
    signatureVerifiedAt: { type: Date, required: true },
    status: {
        type: String,
        enum: WEBHOOK_EVENT_STATUSES,
        default: 'pending',
        required: true,
        validate: {
            validator: function (value) {
                return !this.isNew || value === 'pending';
            },
            message: 'A new webhook event must start in pending status'
        }
    },
    receivedAt: { type: Date, default: Date.now, required: true },
    processedAt: { type: Date },
    attemptCount: {
        type: Number,
        default: 0,
        min: 0,
        validate: {
            validator: Number.isSafeInteger,
            message: 'attemptCount must be a non-negative safe integer'
        }
    },
    processingToken: { type: String },
    processingLeaseExpiresAt: { type: Date },
    lastError: {
        type: String,
        maxlength: 500,
        set: sanitizeLastError
    }
}, {
    timestamps: true,
    autoIndex: false,
    optimisticConcurrency: true
});

paymentWebhookEventSchema.index({ eventId: 1 }, { unique: true });
paymentWebhookEventSchema.index({ status: 1, receivedAt: 1 });
paymentWebhookEventSchema.index({ status: 1, processingLeaseExpiresAt: 1 });

paymentWebhookEventSchema.post('init', function (document) {
    document.$locals.persistedStatus = document.status;
});

paymentWebhookEventSchema.pre('validate', function () {
    if (this.isNew && this.status !== 'pending') {
        throw new Error('A new webhook event must start in pending status');
    }
    if (!this.isNew && this.isModified('status')) {
        throw new Error('Webhook event status changes require atomic processing operations');
    }
    if (!this.isNew && IMMUTABLE_WEBHOOK_AUDIT_FIELDS.some(path => this.isModified(path))) {
        throw new Error('Verified webhook event identity and audit fields are immutable');
    }
    if (this.status === 'processing'
        && (!this.processingToken || !this.processingLeaseExpiresAt)) {
        throw new Error('Processing webhook events require a token and lease expiry');
    }
    if (this.status !== 'processing'
        && (this.processingToken || this.processingLeaseExpiresAt)) {
        throw new Error('Only processing webhook events may hold a processing lease');
    }
    if (!this.isNew && [
        'status', 'processingToken', 'processingLeaseExpiresAt', 'attemptCount',
        'processedAt', 'lastError'
    ].some(path => this.isModified(path))) {
        throw new Error('Webhook processing state must use atomic processing operations');
    }
});

const isPathUpdated = (update, path) => {
    if (!update || Array.isArray(update)) return Array.isArray(update);
    return Object.entries(update).some(([operatorOrPath, value]) => {
        if (operatorOrPath.startsWith('$')) {
            return value && typeof value === 'object'
                && Object.keys(value).some(updatedPath =>
                    updatedPath === path || updatedPath.startsWith(`${path}.`)
                );
        }
        return operatorOrPath === path || operatorOrPath.startsWith(`${path}.`);
    });
};

const findFilterValue = (filter, path) => {
    if (!filter || typeof filter !== 'object') return undefined;
    if (Object.hasOwn(filter, path)) return filter[path];
    for (const logical of ['$and']) {
        if (Array.isArray(filter[logical])) {
            for (const clause of filter[logical]) {
                const value = findFilterValue(clause, path);
                if (value !== undefined) return value;
            }
        }
    }
    return undefined;
};

const hasExpiredLeaseCondition = filter => {
    const operands = filter?.$expr?.$lte;
    if (Array.isArray(operands)
        && operands.length === 2
        && operands[0] === '$processingLeaseExpiresAt'
        && operands[1] === '$$NOW') return true;
    if (filter?.processingLeaseExpiresAt?.$exists === false) return true;
    return ['$and', '$or'].some(logical => Array.isArray(filter?.[logical])
        && filter[logical].some(hasExpiredLeaseCondition));
};

const hasMissingLeaseCondition = filter => filter?.processingLeaseExpiresAt?.$exists === false
    || ['$and', '$or'].some(logical => Array.isArray(filter?.[logical])
        && filter[logical].some(hasMissingLeaseCondition));

const hasServerSideUnexpiredLeaseCondition = filter => {
    const operands = filter?.$expr?.$gt;
    if (Array.isArray(operands)
        && operands.length === 2
        && operands[0] === '$processingLeaseExpiresAt'
        && operands[1] === '$$NOW') return true;
    return ['$and', '$or'].some(logical => Array.isArray(filter?.[logical])
        && filter[logical].some(hasServerSideUnexpiredLeaseCondition));
};

const isExpectedClaimPipeline = (pipeline, currentToken) => {
    if (!Array.isArray(pipeline) || pipeline.length !== 2
        || Object.keys(pipeline[0] || {}).length !== 1
        || !pipeline[0].$set
        || Object.keys(pipeline[1] || {}).length !== 1) return false;
    const set = pipeline[0].$set;
    const fields = ['status', 'processingToken', 'processingLeaseExpiresAt', 'attemptCount', '__v'];
    if (Object.keys(set).length !== fields.length || fields.some(field => !Object.hasOwn(set, field))) return false;
    const lease = set.processingLeaseExpiresAt;
    const attempts = set.attemptCount;
    const version = set.__v;
    const unset = pipeline[1].$unset;
    const clearsError = unset === 'lastError' || isDeepStrictEqual(unset, ['lastError']);
    return set.status === 'processing'
        && typeof set.processingToken === 'string'
        && set.processingToken.length > 0
        && set.processingToken !== currentToken
        && isDeepStrictEqual(lease, { $add: ['$$NOW', 60_000] })
        && isDeepStrictEqual(attempts, { $add: [{ $ifNull: ['$attemptCount', 0] }, 1] })
        && isDeepStrictEqual(version, { $add: [{ $ifNull: ['$__v', 0] }, 1] })
        && clearsError;
};

const updateValue = (update, path) => update?.$set?.[path] ?? update?.[path];

const hasUpdateOperator = (update, operator, path) =>
    Boolean(update?.[operator] && Object.hasOwn(update[operator], path));

const appendWebhookFilter = (filter, clause) => ({ $and: [filter, clause] });

const guardWebhookStateUpdate = async function () {
    const operation = getAuthorizedWebhookOperation(this);
    if (!operation) {
        throw new Error('Webhook state changes must use the atomic processing primitives');
    }

    const update = this.getUpdate();
    if (this.getOptions().upsert) {
        throw new Error('Webhook event upserts are disabled');
    }
    const pipelineUpdate = Array.isArray(update);
    if (pipelineUpdate !== (operation === 'claim')) {
        throw new Error('Webhook claim updates must use the approved server-time pipeline');
    }
    if (!pipelineUpdate && isPathUpdated(update, '__v')) {
        throw new Error('Webhook event version keys are managed by guarded updates');
    }
    if (!pipelineUpdate) {
        if (!isPathUpdated(update, 'status')) {
            throw new Error('Webhook event changes require an atomic status transition');
        }
        if (update.$rename || update.$setOnInsert) {
            throw new Error('Webhook event rename and insert-only updates are disabled');
        }
        if (IMMUTABLE_WEBHOOK_AUDIT_FIELDS.some(path => isPathUpdated(update, path))) {
            throw new Error('Verified webhook event identity and payload are immutable');
        }
    }

    const originalFilter = this.getQuery();
    const current = await this.model.findOne(originalFilter)
        .select('status __v processingToken processingLeaseExpiresAt')
        .lean();
    if (!current) return;

    const nextStatus = pipelineUpdate ? 'processing' : updateValue(update, 'status');
    if (!canTransitionWebhookEventStatus(current.status, nextStatus)) {
        throw new Error(`Invalid webhook event transition: ${current.status} -> ${nextStatus}`);
    }

    if (operation === 'claim') {
        if (!isExpectedClaimPipeline(update, current.processingToken)) {
            throw new Error('Webhook claim pipeline does not match the approved server-time update');
        }
        if (current.status === 'processing') {
            if (!hasExpiredLeaseCondition(originalFilter)
                || (!current.processingLeaseExpiresAt && !hasMissingLeaseCondition(originalFilter))) {
                throw new Error('Processing webhook events can only be reclaimed after lease expiry');
            }
        } else if (!['pending', 'failed'].includes(current.status)) {
            throw new Error('Webhook event is not eligible for a processing claim');
        }
    } else if (operation === 'complete' || operation === 'fail') {
        const expectedStatus = operation === 'complete' ? 'processed' : 'failed';
        if (nextStatus !== expectedStatus) {
            throw new Error(`Webhook ${operation} operation cannot set ${nextStatus}`);
        }
        const suppliedToken = findFilterValue(originalFilter, 'processingToken');
        if (current.status !== 'processing'
            || suppliedToken !== current.processingToken
            || !hasServerSideUnexpiredLeaseCondition(originalFilter)) {
            throw new Error('Webhook completion requires the current unexpired processing token');
        }

        if (nextStatus === 'processed'
            && !(updateValue(update, 'processedAt') instanceof Date)) {
            throw new Error('Processed webhook events require processedAt');
        }
        if (nextStatus === 'failed'
            && typeof updateValue(update, 'lastError') !== 'string') {
            throw new Error('Failed webhook events require a sanitized lastError');
        }
        if (!hasUpdateOperator(update, '$unset', 'processingToken')
            || !hasUpdateOperator(update, '$unset', 'processingLeaseExpiresAt')) {
            throw new Error('Webhook completion must release its processing lease');
        }
    }

    if (pipelineUpdate) {
        let claimFilter = appendWebhookFilter(originalFilter, {
            status: current.status,
            __v: current.__v
        });
        this.setQuery(claimFilter);
        return;
    }

    const controlledFields = [
        'processingToken', 'processingLeaseExpiresAt', 'attemptCount',
        'processedAt', 'lastError'
    ];
    if (controlledFields.some(path => isPathUpdated(update, path)) && !nextStatus) {
        throw new Error('Webhook processing fields require a status transition');
    }
    if (isPathUpdated(update, 'processingToken') && !hasUpdateOperator(update, '$set', 'processingToken')) {
        throw new Error('Webhook processing tokens must be set atomically');
    }

    let guardedFilter = appendWebhookFilter(originalFilter, {
        status: current.status,
        __v: current.__v
    });
    if (nextStatus === 'processed' || nextStatus === 'failed') {
        guardedFilter = appendWebhookFilter(guardedFilter, {
            processingToken: current.processingToken
        });
    }
    update.$inc ||= {};
    update.$inc.__v = 1;
    this.setQuery(guardedFilter);
};

paymentWebhookEventSchema.pre('findOneAndUpdate', guardWebhookStateUpdate);
paymentWebhookEventSchema.pre('updateOne', guardWebhookStateUpdate);

paymentWebhookEventSchema.pre('updateMany', function () {
    throw new Error('Webhook event bulk updates are disabled');
});
paymentWebhookEventSchema.pre('replaceOne', function () {
    throw new Error('Webhook event replacement is disabled');
});
paymentWebhookEventSchema.pre('findOneAndReplace', function () {
    throw new Error('Webhook event replacement is disabled');
});
paymentWebhookEventSchema.pre('bulkWrite', function () {
    throw new Error('Webhook event bulkWrite is disabled');
});

const rejectWebhookEventDeletion = function () {
    throw new Error('Webhook event records cannot be deleted through Mongoose');
};

paymentWebhookEventSchema.pre('deleteOne', { document: false, query: true }, rejectWebhookEventDeletion);
paymentWebhookEventSchema.pre('deleteOne', { document: true, query: false }, rejectWebhookEventDeletion);
paymentWebhookEventSchema.pre('deleteMany', rejectWebhookEventDeletion);
paymentWebhookEventSchema.pre('findOneAndDelete', rejectWebhookEventDeletion);
paymentWebhookEventSchema.pre('findOneAndRemove', rejectWebhookEventDeletion);

const PaymentWebhookEvent = mongoose.model(
    'PaymentWebhookEvent',
    paymentWebhookEventSchema
);

module.exports = PaymentWebhookEvent;
