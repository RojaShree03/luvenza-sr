const mongoose = require('mongoose');
const {
    PAYMENT_STATUSES,
    canTransitionPaymentStatus
} = require('../utils/paymentState');

const IMMUTABLE_AFTER_CAPTURE = [
    'orderId',
    'customerId',
    'attemptNumber',
    'idempotencyKey',
    'razorpayOrderId',
    'razorpayPaymentId',
    'amountMinor',
    'currency',
    'capturedAt'
];

const paymentSchema = new mongoose.Schema({
    orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true
    },
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    attemptNumber: {
        type: Number,
        required: true,
        min: 1,
        validate: {
            validator: Number.isSafeInteger,
            message: 'attemptNumber must be a positive safe integer'
        }
    },
    // Store a stable client-request reference; the payment service should
    // scope/hash raw idempotency keys before persistence.
    idempotencyKey: {
        type: String,
        required: true,
        trim: true,
        minlength: 8,
        maxlength: 128
    },
    razorpayOrderId: {
        type: String,
        trim: true,
        maxlength: 100
    },
    razorpayPaymentId: {
        type: String,
        trim: true,
        maxlength: 100
    },
    amountMinor: {
        type: Number,
        required: true,
        min: 1,
        validate: {
            validator: value => Number.isSafeInteger(value) && value > 0,
            message: 'amountMinor must be a positive safe integer'
        }
    },
    currency: {
        type: String,
        enum: ['INR'],
        default: 'INR',
        required: true
    },
    status: {
        type: String,
        enum: PAYMENT_STATUSES,
        default: 'creating',
        required: true,
        validate: {
            validator: function (value) {
                return !this.isNew || value === 'creating';
            },
            message: 'A new payment attempt must start in creating status'
        }
    },
    capturedAt: { type: Date },
    failedAt: { type: Date }
}, {
    timestamps: true,
    autoIndex: false,
    optimisticConcurrency: true
});

paymentSchema.index(
    { orderId: 1, attemptNumber: 1 },
    { unique: true }
);
paymentSchema.index(
    { customerId: 1, orderId: 1, idempotencyKey: 1 },
    { unique: true }
);
paymentSchema.index(
    { razorpayOrderId: 1 },
    {
        unique: true,
        partialFilterExpression: { razorpayOrderId: { $type: 'string' } }
    }
);
paymentSchema.index(
    { razorpayPaymentId: 1 },
    {
        unique: true,
        partialFilterExpression: { razorpayPaymentId: { $type: 'string' } }
    }
);
paymentSchema.index({ customerId: 1, orderId: 1, attemptNumber: -1 });

paymentSchema.post('init', function (document) {
    document.$locals.persistedStatus = document.status;
});

paymentSchema.post('save', function (document) {
    document.$locals.persistedStatus = document.status;
});

paymentSchema.pre('validate', function () {
    if (this.isNew && this.status !== 'creating') {
        throw new Error('A new payment attempt must start in creating status');
    }

    const previousStatus = this.$locals.persistedStatus;
    if (!this.isNew && this.isModified('status')
        && !canTransitionPaymentStatus(previousStatus, this.status)) {
        throw new Error(`Invalid payment status transition: ${previousStatus} -> ${this.status}`);
    }

    if (this.isModified('status') && this.status === 'captured' && !this.capturedAt) {
        this.capturedAt = new Date();
    }
    if (this.isModified('status') && this.status === 'failed' && !this.failedAt) {
        this.failedAt = new Date();
    }

    if (previousStatus === 'captured'
        && IMMUTABLE_AFTER_CAPTURE.some(field => this.isModified(field))) {
        throw new Error('Captured payment identity and amount fields are immutable');
    }
    if (this.status === 'captured'
        && IMMUTABLE_AFTER_CAPTURE.some(field => field !== 'capturedAt' && this.isModified(field))) {
        throw new Error('Captured payment identity and amount fields cannot change during capture');
    }
});

const isPathUpdated = (update, path) => {
    if (!update || Array.isArray(update)) return Array.isArray(update);
    return Object.entries(update).some(([operatorOrPath, value]) => {
        if (operatorOrPath.startsWith('$')) {
            return value && typeof value === 'object'
                && Object.entries(value).some(([updatedPath, updateValue]) => {
                    const matchesPath = candidate => candidate === path
                        || candidate.startsWith(`${path}.`);
                    return matchesPath(updatedPath)
                        || (operatorOrPath === '$rename'
                            && typeof updateValue === 'string'
                            && matchesPath(updateValue));
                });
        }
        return operatorOrPath === path || operatorOrPath.startsWith(`${path}.`);
    });
};

const appendPaymentFilter = (query, clause) => ({ $and: [query, clause] });

const hasExactDocumentId = query => {
    if (!query || typeof query !== 'object') return false;
    const id = query._id;
    if (id instanceof mongoose.Types.ObjectId) return true;
    if (typeof id === 'string') return mongoose.isValidObjectId(id);
    return Array.isArray(query.$and) && query.$and.some(hasExactDocumentId);
};

const guardSingleDocumentUpdate = async function () {
    const update = this.getUpdate();
    if (Array.isArray(update)) {
        throw new Error('Aggregation-pipeline updates are disabled for Payment records');
    }
    if (this.getOptions().upsert) {
        throw new Error('Payment upserts are disabled; create an attempt explicitly');
    }

    const originalQuery = this.getQuery();
    if (!hasExactDocumentId(originalQuery)) {
        throw new Error('Payment guarded updates require an exact document _id');
    }

    if (isPathUpdated(update, '__v')) {
        throw new Error('Payment version keys are managed by guarded updates');
    }

    const changesStatus = isPathUpdated(update, 'status');
    const changesProtectedField = IMMUTABLE_AFTER_CAPTURE
        .some(path => isPathUpdated(update, path));

    const current = await this.model.findOne(originalQuery)
        .select('status __v')
        .lean();
    if (!current) return;

    if (changesStatus) {
        const nextStatus = update.status ?? update.$set?.status;
        if (!canTransitionPaymentStatus(current.status, nextStatus)) {
            throw new Error(`Invalid payment status transition: ${current.status} -> ${nextStatus}`);
        }
        if (nextStatus === 'captured'
            && IMMUTABLE_AFTER_CAPTURE.some(field => field !== 'capturedAt'
                && isPathUpdated(update, field))) {
            throw new Error('Captured payment identity and amount fields cannot change during capture');
        }
    }

    if (current.status === 'captured' && changesProtectedField) {
        throw new Error('Captured payment identity and amount fields are immutable');
    }

    let guardedQuery = appendPaymentFilter(originalQuery, {
        status: current.status,
        __v: current.__v
    });
    if (changesProtectedField) {
        guardedQuery = appendPaymentFilter(guardedQuery, { status: { $ne: 'captured' } });
    }
    update.$inc ||= {};
    update.$inc.__v = 1;
    this.setQuery(guardedQuery);
};

paymentSchema.pre('findOneAndUpdate', guardSingleDocumentUpdate);
paymentSchema.pre('updateOne', guardSingleDocumentUpdate);

paymentSchema.pre('updateMany', function () {
    throw new Error('Payment bulk updates are disabled; use guarded single-document operations');
});

paymentSchema.pre('replaceOne', function () {
    throw new Error('Payment replacement is disabled; use guarded field updates');
});
paymentSchema.pre('findOneAndReplace', function () {
    throw new Error('Payment replacement is disabled; use guarded field updates');
});
paymentSchema.pre('bulkWrite', function () {
    throw new Error('Payment bulkWrite is disabled; use guarded single-document operations');
});

const rejectPaymentDeletion = function () {
    throw new Error('Payment attempt records cannot be deleted through Mongoose');
};

paymentSchema.pre('deleteOne', { document: false, query: true }, rejectPaymentDeletion);
paymentSchema.pre('deleteOne', { document: true, query: false }, rejectPaymentDeletion);
paymentSchema.pre('deleteMany', rejectPaymentDeletion);
paymentSchema.pre('findOneAndDelete', rejectPaymentDeletion);
paymentSchema.pre('findOneAndRemove', rejectPaymentDeletion);

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment;
