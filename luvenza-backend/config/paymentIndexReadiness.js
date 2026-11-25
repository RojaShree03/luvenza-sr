const PAYMENT_REQUIRED_INDEXES = Object.freeze([
    {
        key: [['orderId', 1], ['attemptNumber', 1]],
        unique: true
    },
    {
        key: [['customerId', 1], ['orderId', 1], ['idempotencyKey', 1]],
        unique: true
    },
    {
        key: [['razorpayOrderId', 1]],
        unique: true,
        partialFilterExpression: { razorpayOrderId: { $type: 'string' } }
    },
    {
        key: [['razorpayPaymentId', 1]],
        unique: true,
        partialFilterExpression: { razorpayPaymentId: { $type: 'string' } }
    },
    {
        key: [['customerId', 1], ['orderId', 1], ['attemptNumber', -1]],
        unique: false
    }
]);

const WEBHOOK_REQUIRED_INDEXES = Object.freeze([
    {
        key: [['eventId', 1]],
        unique: true
    },
    {
        key: [['status', 1], ['receivedAt', 1]],
        unique: false
    },
    {
        key: [['status', 1], ['processingLeaseExpiresAt', 1]],
        unique: false
    }
]);

const samePartialFilter = (actual, expected) => {
    if (!expected) return actual === undefined;
    if (!actual || Object.keys(actual).length !== Object.keys(expected).length) return false;

    const [[expectedField, expectedExpression]] = Object.entries(expected);
    const [[actualField, actualExpression]] = Object.entries(actual);
    const expectedType = expectedExpression?.$type;
    const actualType = actualExpression?.$type;

    return actualField === expectedField
        && Object.keys(actualExpression || {}).length === 1
        && Object.keys(expectedExpression || {}).length === 1
        && (actualType === expectedType
            || (expectedType === 'string' && actualType === 2));
};

const matchesRequiredIndex = (index, expected) => {
    const actualKey = Object.entries(index.key || {});
    return actualKey.length === expected.key.length
        && actualKey.every(([field, direction], position) =>
            field === expected.key[position][0]
            && direction === expected.key[position][1]
        )
        && (expected.unique ? index.unique === true : index.unique !== true)
        && samePartialFilter(index.partialFilterExpression, expected.partialFilterExpression);
};

const verifyCollectionIndexes = async (collection, required, label) => {
    const indexes = await collection.listIndexes().toArray();
    const missing = required.filter(expected =>
        !indexes.some(index => matchesRequiredIndex(index, expected))
    );
    if (missing.length) {
        const description = missing.map(index =>
            index.key.map(([field, direction]) => `${field}_${direction}`).join('_')
        ).join(', ');
        throw new Error(`${label} indexes are missing or mismatched: ${description}`);
    }
    return true;
};

const verifyPaymentIndexes = async (paymentCollection, webhookEventCollection) => {
    await verifyCollectionIndexes(
        paymentCollection,
        PAYMENT_REQUIRED_INDEXES,
        'Payment'
    );
    await verifyCollectionIndexes(
        webhookEventCollection,
        WEBHOOK_REQUIRED_INDEXES,
        'PaymentWebhookEvent'
    );
    return true;
};

module.exports = {
    PAYMENT_REQUIRED_INDEXES,
    WEBHOOK_REQUIRED_INDEXES,
    matchesRequiredIndex,
    verifyPaymentIndexes
};
