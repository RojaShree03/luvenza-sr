'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Payment = require('../models/payment');
const { REQUIRED_INDEXES, verifyPaymentIndexes } = require('../config/paymentIndexReadiness');

test('Payment schema declares required unique and partial indexes', () => {
    const declared = Payment.schema.indexes();
    for (const required of REQUIRED_INDEXES) {
        const [key, options] = declared.find(([candidate, settings]) => settings.name === required.name) || [];
        assert.ok(key, `missing schema index ${required.name}`);
        assert.deepEqual(key, required.key);
        assert.equal(options.unique, true);
        assert.deepEqual(options.partialFilterExpression || null, required.partialFilterExpression || null);
    }
    const active = REQUIRED_INDEXES.find((index) => index.name === 'uniq_active_payment_per_order');
    assert.deepEqual(active.partialFilterExpression, { activeOrderKey: { $type: 'string' } });
});

test('startup readiness rejects an index with a mismatched partial filter', async () => {
    const indexes = REQUIRED_INDEXES.map((index) => ({
        ...index,
        key: { ...index.key },
        partialFilterExpression: index.name === 'uniq_active_payment_per_order'
            ? { activeOrderKey: { $exists: true } }
            : index.partialFilterExpression
    }));
    await assert.rejects(
        verifyPaymentIndexes({ listIndexes: () => ({ toArray: async () => indexes }) }),
        { code: 'PAYMENT_INDEX_NOT_READY' }
    );
});

test('startup readiness accepts the declared index set', async () => {
    const indexes = REQUIRED_INDEXES.map((index) => ({ ...index, key: { ...index.key } }));
    assert.equal(await verifyPaymentIndexes({ listIndexes: () => ({ toArray: async () => indexes }) }), true);
});
