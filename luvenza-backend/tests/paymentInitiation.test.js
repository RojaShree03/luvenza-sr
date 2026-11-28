'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { amountToPaise, providerMatches, resolveProviderOrder, reserve } = require('../services/paymentInitiationService');

test('converts only positive INR amounts representable as whole paise', () => {
    assert.equal(amountToPaise(12.34), 1234);
    assert.equal(amountToPaise(0.01), 1);
    assert.equal(amountToPaise(0), null);
    assert.equal(amountToPaise(-1), null);
    assert.equal(amountToPaise(1.001), null);
    assert.equal(amountToPaise(Number.MAX_SAFE_INTEGER), null);
});

test('provider response must match receipt, paise amount and currency', () => {
    const attempt = { amount: 1250, currency: 'INR', receipt: 'l123_1' };
    assert.equal(providerMatches({ id: 'order_abc', amount: 1250, currency: 'INR', receipt: 'l123_1' }, attempt), true);
    assert.equal(providerMatches({ id: 'order_abc', amount: 1251, currency: 'INR', receipt: 'l123_1' }, attempt), false);
    assert.equal(providerMatches({ id: 'order_abc', amount: 1250, currency: 'USD', receipt: 'l123_1' }, attempt), false);
    assert.equal(providerMatches({ id: 'order_abc', amount: 1250, currency: 'INR', receipt: 'other' }, attempt), false);
});

test('ambiguous create timeout recovers the provider Order by stable receipt', async () => {
    const attempt = { _id: 'attempt-1', orderId: 'order-1', amount: 1234, currency: 'INR', receipt: 'lorder-1_1' };
    const recoveredOrder = { id: 'order_provider', amount: 1234, currency: 'INR', receipt: attempt.receipt };
    let lookups = 0;
    let createAttempts = 0;
    const provider = {
        findOrdersByReceipt: async () => (++lookups === 1 ? [] : [recoveredOrder]),
        createOrder: async () => { createAttempts += 1; const error = new Error('timeout'); error.code = 'ETIMEDOUT'; throw error; }
    };
    const result = await resolveProviderOrder({ attempt, razorpay: provider });
    assert.equal(result.id, 'order_provider');
    assert.equal(lookups, 2);
    assert.equal(createAttempts, 1);
});

test('receipt reconciliation rejects a provider Order with a different amount', async () => {
    const attempt = { amount: 1234, currency: 'INR', receipt: 'lorder-1_1' };
    const provider = {
        findOrdersByReceipt: async () => [{ id: 'order_provider', amount: 1235, currency: 'INR', receipt: attempt.receipt }],
        createOrder: async () => { throw new Error('must not create another Order'); }
    };
    await assert.rejects(resolveProviderOrder({ attempt, razorpay: provider }), { code: 'PROVIDER_ORDER_MISMATCH' });
});

test('mocked concurrent reservations cannot allocate two active attempts for one Order', async () => {
    const records = [];
    const repository = {
        getByIdempotencyKey: async (orderId, key) => records.find((item) => String(item.orderId) === String(orderId) && item.idempotencyKey === key) || null,
        getActiveForOrder: async (orderId) => records.find((item) => item.activeOrderKey === String(orderId)) || null,
        getLatestAttemptNumber: async (orderId) => Math.max(0, ...records.filter((item) => String(item.orderId) === String(orderId)).map((item) => item.attemptNumber)),
        insertReservation: async (item) => {
            await new Promise((resolve) => setImmediate(resolve));
            if (records.some((other) => other.activeOrderKey === item.activeOrderKey || (String(other.orderId) === String(item.orderId) && other.attemptNumber === item.attemptNumber))) {
                const error = new Error('duplicate key');
                error.code = 11000;
                throw error;
            }
            const created = { ...item, _id: String(records.length + 1) };
            records.push(created);
            return created;
        },
        claimExpiredReservation: async () => null
    };
    const order = { _id: 'order-1' };
    const outcomes = await Promise.allSettled([
        reserve({ order, customerId: 'customer-1', idempotencyKey: 'request-key-1', amount: 1000, leaseMs: 45000, repository }),
        reserve({ order, customerId: 'customer-1', idempotencyKey: 'request-key-2', amount: 1000, leaseMs: 45000, repository })
    ]);
    assert.equal(outcomes.filter((outcome) => outcome.status === 'fulfilled').length, 1);
    assert.equal(outcomes.filter((outcome) => outcome.status === 'rejected' && outcome.reason.code === 11000).length, 1);
    assert.equal(records.length, 1);
    assert.equal(records[0].attemptNumber, 1);
});

test('a different idempotency key cannot take over an expired active reservation', async () => {
    const existing = { _id: 'attempt-1', idempotencyKey: 'original-key', activeOrderKey: 'order-1', leaseExpiresAt: new Date(0), status: 'ambiguous' };
    const repository = {
        getByIdempotencyKey: async () => null,
        getActiveForOrder: async () => existing,
        getLatestAttemptNumber: async () => 1,
        claimExpiredReservation: async () => { throw new Error('should not claim a different key'); },
        insertReservation: async () => { throw new Error('should not insert'); }
    };
    const result = await reserve({ order: { _id: 'order-1' }, customerId: 'customer-1', idempotencyKey: 'different-key', amount: 1000, leaseMs: 45000, repository });
    assert.match(result.conflict, /active/);
});

test('same idempotency key replays its created attempt and rejects changed amount', async () => {
    const existing = { _id: 'attempt-1', idempotencyKey: 'same-key-123', amount: 1000, currency: 'INR', status: 'created' };
    const repository = {
        getByIdempotencyKey: async () => existing,
        getActiveForOrder: async () => { throw new Error('active lookup is not needed for replay'); }
    };
    const replay = await reserve({ order: { _id: 'order-1' }, customerId: 'customer-1', idempotencyKey: 'same-key-123', amount: 1000, leaseMs: 45000, repository });
    assert.equal(replay.attempt, existing);
    assert.equal(replay.replay, true);
    const conflict = await reserve({ order: { _id: 'order-1' }, customerId: 'customer-1', idempotencyKey: 'same-key-123', amount: 2000, leaseMs: 45000, repository });
    assert.match(conflict.conflict, /different payment details/);
});
