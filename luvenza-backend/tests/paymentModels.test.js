const assert = require('node:assert/strict');
const test = require('node:test');

const Payment = require('../models/payment');
const PaymentWebhookEvent = require('../models/paymentWebhookEvent');
const {
    PAYMENT_STATUSES,
    PAYMENT_TRANSITIONS,
    WEBHOOK_EVENT_STATUSES,
    canTransitionPaymentStatus,
    canTransitionWebhookEventStatus
} = require('../utils/paymentState');
const {
    PAYMENT_REQUIRED_INDEXES,
    WEBHOOK_REQUIRED_INDEXES,
    verifyPaymentIndexes
} = require('../config/paymentIndexReadiness');
const {
    __testOnly: { createPaymentRepository }
} = require('../repositories/paymentRepository');
const {
    __testOnly: { createPaymentWebhookEventRepository }
} = require('../repositories/paymentWebhookEventRepository');
const {
    __testOnly: { createClaimCompletion }
} = require('../repositories/paymentWebhookEventCompletion');
const {
    __testOnly: { createWebhookProcessor }
} = require('../utils/paymentWebhookProcessing');
const { authorizeWebhookQuery } = require('../utils/webhookTransitionAuthorization');

const orderId = '64b000000000000000000501';
const customerId = '64b000000000000000000502';

const validPayment = overrides => new Payment({
    orderId,
    customerId,
    attemptNumber: 1,
    idempotencyKey: 'customer-attempt-key-0001',
    amountMinor: 249900,
    currency: 'INR',
    ...overrides
});

const validEvent = overrides => new PaymentWebhookEvent({
    eventId: 'evt_payment_captured_001',
    eventType: 'payment.captured',
    payload: { payment: { id: 'pay_001', status: 'captured' } },
    signatureVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides
});

test('Payment repository exposes only attempt creation and state transition writes', async () => {
    let persisted;
    let lastFilter;
    class FakePaymentModel {
        constructor(fields) {
            Object.assign(this, fields);
            this._id = 'payment-1';
            this.__v = 0;
        }
        async save() {
            persisted = { ...this };
            return this;
        }
        static findOne(filter) {
            const matches = () => persisted && (
                filter._id ? persisted._id === filter._id
                    : persisted.customerId === filter.customerId
                        && persisted.orderId === filter.orderId
                        && persisted.idempotencyKey === filter.idempotencyKey
            ) ? persisted : null;
            const query = {
                then: (resolve, reject) => Promise.resolve(matches()).then(resolve, reject),
                select: () => ({ lean: async () => persisted && (
                    filter._id ? persisted._id === filter._id
                        : persisted.customerId === filter.customerId
                            && persisted.orderId === filter.orderId
                            && persisted.idempotencyKey === filter.idempotencyKey
                ) ? { status: persisted.status, __v: persisted.__v } : null })
            };
            return query;
        }
        static async findOneAndUpdate(filter, update) {
            lastFilter = filter;
            if (!persisted || filter._id !== persisted._id
                || filter.status !== persisted.status || filter.__v !== persisted.__v) return null;
            persisted = { ...persisted, ...update.$set, __v: persisted.__v + 1 };
            return persisted;
        }
    }

    const repository = createPaymentRepository(FakePaymentModel);
    assert.deepEqual(Object.keys(repository).sort(), ['createPaymentAttempt', 'transitionPaymentState']);
    await repository.createPaymentAttempt({
        orderId, customerId, attemptNumber: 1,
        idempotencyKey: 'repo-payment-attempt-1', amountMinor: 12500, currency: 'INR'
    });
    const created = await repository.transitionPaymentState({
        paymentId: 'payment-1', nextStatus: 'created', razorpayOrderId: 'order_provider_1'
    });
    assert.equal(created.status, 'created');
    assert.equal(persisted.razorpayOrderId, 'order_provider_1');
    assert.deepEqual(lastFilter, { _id: 'payment-1', status: 'creating', __v: 0 });
    assert.equal(persisted.__v, 1);
    await assert.rejects(repository.transitionPaymentState({
        paymentId: 'payment-1', nextStatus: 'pending'
    }), /Invalid payment status transition/);
});

test('payment retry returns the same attempt and concurrent duplicate-key retry does not create another', async () => {
    const records = [];
    class ConcurrentPayment {
        constructor(fields) { Object.assign(this, fields); this._id = `p${records.length + 1}`; this.__v = 0; }
        async save() {
            if (records.some(record => record.customerId === this.customerId
                && record.orderId === this.orderId && record.idempotencyKey === this.idempotencyKey)) {
                const error = new Error('duplicate'); error.code = 11000; throw error;
            }
            records.push(this); return this;
        }
        static async findOne(filter) {
            if (filter._id) return records.find(record => record._id === filter._id) || null;
            return records.find(record => record.customerId === filter.customerId
                && record.orderId === filter.orderId && record.idempotencyKey === filter.idempotencyKey) || null;
        }
    }
    const repo = createPaymentRepository(ConcurrentPayment);
    const request = { orderId, customerId, attemptNumber: 1, idempotencyKey: 'stable-retry-key-001', amountMinor: 3400 };
    const [first, retried] = await Promise.all([
        repo.createPaymentAttempt(request), repo.createPaymentAttempt(request)
    ]);
    assert.equal(records.length, 1);
    assert.equal(first._id, retried._id);
    assert.equal((await repo.createPaymentAttempt(request))._id, first._id);
    await assert.rejects(repo.createPaymentAttempt({ ...request, amountMinor: 3500 }), /conflicting payment attempt/);
});

test('webhook repository creates only a pending event and initializes retry metadata', async () => {
    let saved;
    class FakeWebhookModel {
        constructor(fields) { Object.assign(this, fields); }
        async validate() {}
        async save() { saved = { ...this }; return this; }
        static findOne(filter) { return Promise.resolve(saved?.eventId === filter.eventId ? saved : null); }
    }
    const repository = createPaymentWebhookEventRepository(FakeWebhookModel);
    await repository.createVerifiedWebhookEvent({
        eventId: 'evt_repo_001', eventType: 'payment.captured',
        payload: { paymentId: 'pay_repo_001' },
        signatureVerifiedAt: new Date(), status: 'processed', attemptCount: 99
    });
    assert.equal(saved.status, 'pending');
    assert.equal(saved.attemptCount, 0);
    assert.equal(saved.processingToken, undefined);
});

test('verified webhook event creation is idempotent and preserves existing processing state', async () => {
    const records = [];
    class ConcurrentEvent {
        constructor(fields) { Object.assign(this, fields); }
        async validate() {
            if (!this.eventId || !this.eventType || !this.signatureVerifiedAt) throw new Error('invalid event');
        }
        async save() {
            if (records.some(record => record.eventId === this.eventId)) {
                const error = new Error('duplicate'); error.code = 11000; throw error;
            }
            records.push(this); return this;
        }
        static async findOne(filter) { return records.find(record => record.eventId === filter.eventId) || null; }
    }
    const repo = createPaymentWebhookEventRepository(ConcurrentEvent);
    const input = {
        eventId: 'evt_idempotent_001', eventType: 'payment.captured',
        payload: { payment: { id: 'pay_same', amount: 12500 } },
        signatureVerifiedAt: new Date('2026-02-01T00:00:00Z')
    };
    const [first, retried] = await Promise.all([
        repo.createVerifiedWebhookEvent(input), repo.createVerifiedWebhookEvent(input)
    ]);
    assert.equal(records.length, 1);
    assert.equal(first.eventId, retried.eventId);
    records[0].status = 'processed';
    records[0].signatureVerifiedAt = new Date('2026-02-02T00:00:00Z');
    const recovery = await repo.createVerifiedWebhookEvent(input);
    assert.equal(recovery.status, 'processed');
    assert.equal(recovery.signatureVerifiedAt.toISOString(), '2026-02-02T00:00:00.000Z');
    await assert.rejects(repo.createVerifiedWebhookEvent({ ...input, payload: { payment: { id: 'different' } } }), /conflicting event data/);
});

const indexesFromRequirements = requirements => requirements.map((required, index) => ({
    name: `index_${index}`,
    key: Object.fromEntries(required.key),
    ...(required.unique ? { unique: true } : {}),
    ...(required.partialFilterExpression
        ? { partialFilterExpression: structuredClone(required.partialFilterExpression) }
        : {})
}));

const collectionWithIndexes = indexes => ({
    listIndexes: () => ({ toArray: async () => indexes })
});

test('valid Payment attempt defaults to creating and validates', async () => {
    const payment = validPayment();
    assert.equal(payment.status, 'creating');
    assert.equal(payment.currency, 'INR');
    await assert.doesNotReject(payment.validate());
});

test('Payment rejects zero, fractional and unsafe amountMinor values', () => {
    for (const amountMinor of [0, -1, 10.5, Number.MAX_SAFE_INTEGER + 1]) {
        const error = validPayment({ amountMinor }).validateSync();
        assert.ok(error?.errors.amountMinor, `amountMinor ${amountMinor} should fail`);
    }
});

test('Payment only accepts INR currency', () => {
    const error = validPayment({ currency: 'USD' }).validateSync();
    assert.ok(error?.errors.currency);
});

test('Payment rejects values outside the controlled status vocabulary', () => {
    assert.deepEqual(PAYMENT_STATUSES, [
        'creating', 'created', 'authorized', 'captured', 'failed', 'needs_review'
    ]);
    const error = validPayment({ status: 'settled' }).validateSync();
    assert.ok(error?.errors.status);
});

test('payment state machine permits captured webhook arrival before authorization event', () => {
    assert.equal(canTransitionPaymentStatus('created', 'captured'), true);
    assert.equal(canTransitionPaymentStatus('authorized', 'captured'), true);
    assert.equal(canTransitionPaymentStatus('captured', 'failed'), false);
    assert.equal(canTransitionPaymentStatus('failed', 'captured'), false);
    assert.deepEqual(PAYMENT_TRANSITIONS.captured, []);
});

test('multiple Payment attempts for one order validate as separate documents', async () => {
    const first = validPayment({ attemptNumber: 1, idempotencyKey: 'attempt-one-key-001' });
    const second = validPayment({ attemptNumber: 2, idempotencyKey: 'attempt-two-key-002' });
    await Promise.all([first.validate(), second.validate()]);
    assert.equal(first.orderId.toString(), second.orderId.toString());
    assert.notEqual(first.attemptNumber, second.attemptNumber);
});

test('Payment schema declares unique attempt, scoped idempotency and provider identifier indexes', () => {
    const declared = Payment.schema.indexes();
    const expected = [
        [{ orderId: 1, attemptNumber: 1 }, { unique: true }],
        [{ customerId: 1, orderId: 1, idempotencyKey: 1 }, { unique: true }],
        [{ razorpayOrderId: 1 }, {
            unique: true,
            partialFilterExpression: { razorpayOrderId: { $type: 'string' } }
        }],
        [{ razorpayPaymentId: 1 }, {
            unique: true,
            partialFilterExpression: { razorpayPaymentId: { $type: 'string' } }
        }]
    ];

    for (const [key, options] of expected) {
        assert.ok(declared.some(([actualKey, actualOptions]) =>
            JSON.stringify(actualKey) === JSON.stringify(key)
            && actualOptions.unique === options.unique
            && JSON.stringify(actualOptions.partialFilterExpression)
                === JSON.stringify(options.partialFilterExpression)
        ));
    }
    assert.equal(Payment.schema.options.autoIndex, false);
});

test('captured Payment identity, amount, currency and provider identifiers are immutable on save', async () => {
    const payment = validPayment();
    payment.status = 'captured';
    payment.$locals.persistedStatus = 'captured';
    payment.isNew = false;
    payment.amountMinor += 100;

    await assert.rejects(payment.validate(), /identity and amount fields are immutable/);
});

test('Payment deletion is rejected by query and document Mongoose methods', async () => {
    await assert.rejects(Payment.deleteOne({ _id: orderId }).exec(), /cannot be deleted through Mongoose/);
    await assert.rejects(Payment.deleteMany({}).exec(), /cannot be deleted through Mongoose/);
    await assert.rejects(Payment.findOneAndDelete({ _id: orderId }).exec(), /cannot be deleted through Mongoose/);
    if (typeof Payment.findOneAndRemove === 'function') {
        await assert.rejects(Payment.findOneAndRemove({ _id: orderId }).exec(), /cannot be deleted through Mongoose/);
    }
    const document = Payment.hydrate({
        _id: orderId, orderId, customerId, attemptNumber: 1,
        idempotencyKey: 'delete-test-key-0001', amountMinor: 1,
        currency: 'INR', status: 'captured', __v: 0
    });
    await assert.rejects(document.deleteOne(), /cannot be deleted through Mongoose/);
});

test('hydrated webhook audit fields are immutable on document save', async () => {
    const fields = ['eventId', 'eventType', 'payload', 'signatureVerifiedAt', 'receivedAt'];
    for (const field of fields) {
        const document = PaymentWebhookEvent.hydrate({
            _id: '64b000000000000000000505', eventId: 'evt_audit_protect',
            eventType: 'payment.captured', payload: { payment: { id: 'pay_audit' } },
            signatureVerifiedAt: new Date('2026-01-01T00:00:00.000Z'),
            receivedAt: new Date('2026-01-01T00:01:00.000Z'), status: 'pending',
            attemptCount: 0, __v: 0
        });
        if (field === 'eventId') document.eventId = 'evt_changed';
        if (field === 'eventType') document.eventType = 'payment.failed';
        if (field === 'payload') {
            document.payload.payment.id = 'pay_changed';
            document.markModified('payload');
        }
        if (field === 'signatureVerifiedAt') document.signatureVerifiedAt = new Date('2026-01-02T00:00:00.000Z');
        if (field === 'receivedAt') document.receivedAt = new Date('2026-01-02T00:00:00.000Z');
        await assert.rejects(document.save(), /identity and audit fields are immutable/, field);
    }
});

test('PaymentWebhookEvent deletion is rejected by query and document Mongoose methods', async () => {
    await assert.rejects(PaymentWebhookEvent.deleteOne({ eventId: 'evt_payment_captured_001' }).exec(),
        /cannot be deleted through Mongoose/);
    await assert.rejects(PaymentWebhookEvent.deleteMany({}).exec(),
        /cannot be deleted through Mongoose/);
    await assert.rejects(PaymentWebhookEvent.findOneAndDelete({ eventId: 'evt_payment_captured_001' }).exec(),
        /cannot be deleted through Mongoose/);
    if (typeof PaymentWebhookEvent.findOneAndRemove === 'function') {
        await assert.rejects(PaymentWebhookEvent.findOneAndRemove({ eventId: 'evt_payment_captured_001' }).exec(),
            /cannot be deleted through Mongoose/);
    }
    const document = PaymentWebhookEvent.hydrate({
        _id: '64b000000000000000000504', eventId: 'evt_deletion_test',
        eventType: 'payment.captured', payload: { id: 'pay_test' },
        signatureVerifiedAt: new Date(), status: 'processed', attemptCount: 1
    });
    await assert.rejects(document.deleteOne(), /cannot be deleted through Mongoose/);
});

test('Payment query middleware guards captured-field updates and status transitions', () => {
    const hooks = Payment.schema.s.hooks._pres;
    assert.ok(hooks.get('findOneAndUpdate')?.some(hook => hook.fn));
    assert.ok(hooks.get('updateOne')?.some(hook => hook.fn));
    assert.ok(hooks.get('updateMany')?.some(hook => hook.fn));
    assert.equal(canTransitionPaymentStatus('creating', 'created'), true);
    assert.equal(canTransitionPaymentStatus('creating', 'captured'), true);
});

const hookFor = (model, operation, name) => model.schema.s.hooks._pres.get(operation)
    .find(hook => hook.fn?.name === name)?.fn;

const runPaymentUpdateGuard = async ({ current, query, update }) => {
    const context = {
        update,
        getUpdate: () => update,
        getOptions: () => ({}),
        getQuery: () => query,
        setQuery: next => { context.query = next; },
        model: {
            findOne: () => ({
                select: () => ({ lean: async () => current })
            })
        }
    };
    await hookFor(Payment, 'findOneAndUpdate', 'guardSingleDocumentUpdate').call(context);
    return context;
};

test('Payment guarded query updates use persisted status and version as a CAS', async () => {
    const context = await runPaymentUpdateGuard({
        current: { status: 'created', __v: 4 },
        query: { _id: orderId },
        update: { $set: { status: 'captured' } }
    });

    assert.deepEqual(context.query.$and[1], { status: 'created', __v: 4 });
    assert.equal(context.update.$inc.__v, 1);
});

test('a stale loaded Payment document cannot overwrite a query-captured payment', async t => {
    const stale = Payment.hydrate({
        _id: '64b000000000000000000503', orderId, customerId,
        attemptNumber: 1, idempotencyKey: 'stale-payment-key-001',
        amountMinor: 249900, currency: 'INR', status: 'created', __v: 0
    });
    stale.status = 'failed';
    stale.amountMinor = 1;

    const originalUpdateOne = Payment.collection.updateOne;
    t.after(() => { Payment.collection.updateOne = originalUpdateOne; });
    let persisted = { status: 'captured', amountMinor: 249900, __v: 1 };
    Payment.collection.updateOne = async (_filter, update) => {
        const version = update.$set?.__v ?? update.$inc?.__v;
        if (stale.__v !== persisted.__v || version !== undefined) {
            return { acknowledged: true, matchedCount: 0, modifiedCount: 0 };
        }
        persisted = { ...persisted, ...update.$set };
        return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
    };

    await assert.rejects(stale.save(), /VersionError|No matching document/);
    assert.deepEqual(persisted, { status: 'captured', amountMinor: 249900, __v: 1 });
});

test('competing Payment state updates share the same version and only one CAS can win', async () => {
    const initial = { status: 'created', __v: 2 };
    const first = await runPaymentUpdateGuard({
        current: initial,
        query: { _id: orderId },
        update: { $set: { status: 'captured' } }
    });
    const competing = await runPaymentUpdateGuard({
        current: initial,
        query: { _id: orderId },
        update: { $set: { status: 'failed' } }
    });
    let persisted = { ...initial };
    const applyCas = context => {
        const expected = context.query.$and[1];
        if (persisted.status !== expected.status || persisted.__v !== expected.__v) return false;
        persisted = { status: context.update.$set.status, __v: persisted.__v + 1 };
        return true;
    };

    assert.equal(applyCas(first), true);
    assert.equal(applyCas(competing), false);
    assert.deepEqual(persisted, { status: 'captured', __v: 3 });
});

test('valid webhook event starts pending with retry metadata', async () => {
    const event = validEvent();
    assert.equal(event.status, 'pending');
    assert.equal(event.attemptCount, 0);
    await assert.doesNotReject(event.validate());
});

test('webhook event schema declares durable deduplication and retry indexes', () => {
    const declared = PaymentWebhookEvent.schema.indexes();
    assert.ok(declared.some(([key, options]) =>
        JSON.stringify(key) === JSON.stringify({ eventId: 1 })
        && options.unique === true
    ));
    assert.ok(declared.some(([key]) =>
        JSON.stringify(key) === JSON.stringify({ status: 1, receivedAt: 1 })
    ));
    assert.equal(PaymentWebhookEvent.schema.options.autoIndex, false);
});

test('duplicate webhook event protection is backed by a unique eventId index declaration', () => {
    assert.ok(PaymentWebhookEvent.schema.path('eventId').options.required);
    assert.ok(PaymentWebhookEvent.schema.indexes().some(([key, options]) =>
        key.eventId === 1 && options.unique === true
    ));
});

test('failed webhook events remain eligible for retry through the state machine', () => {
    assert.deepEqual(WEBHOOK_EVENT_STATUSES, ['pending', 'processing', 'processed', 'failed']);
    assert.equal(canTransitionWebhookEventStatus('failed', 'processing'), true);
    assert.equal(canTransitionWebhookEventStatus('processing', 'failed'), true);
    assert.equal(canTransitionWebhookEventStatus('processed', 'processing'), false);
});

test('webhook event rejects invalid processing status', () => {
    const error = validEvent({ status: 'queued' }).validateSync();
    assert.ok(error?.errors.status);
});

test('webhook updateMany is disabled and direct status changes require the processor primitive', async () => {
    await assert.rejects(PaymentWebhookEvent.updateMany({}, { $set: { status: 'processed' } }).exec(),
        /bulk updates are disabled/);
    await assert.rejects(PaymentWebhookEvent.findOneAndUpdate(
        { eventId: 'evt_payment_captured_001' }, { $set: { status: 'processed' } }
    ).exec(), /atomic processing primitives/);
});

const clone = value => structuredClone(value);
const matchesMockFilter = (document, filter, serverNow) => {
    for (const [key, condition] of Object.entries(filter || {})) {
        if (key === '$expr') {
            const operator = Object.keys(condition || {})[0];
            const operands = condition?.[operator];
            if (!Array.isArray(operands) || operands.length !== 2) return false;
            const left = operands[0] === '$processingLeaseExpiresAt'
                ? document.processingLeaseExpiresAt : undefined;
            const right = operands[1] === '$$NOW' ? serverNow : undefined;
            if (!(left instanceof Date) || !(right instanceof Date)) return false;
            if (operator === '$lte' && left > right) return false;
            if (operator === '$gt' && left <= right) return false;
            continue;
        }
        if (key === '$and') {
            if (!condition.every(clause => matchesMockFilter(document, clause, serverNow))) return false;
            continue;
        }
        if (key === '$or') {
            if (!condition.some(clause => matchesMockFilter(document, clause, serverNow))) return false;
            continue;
        }
        const actual = document[key];
        if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
            if (Object.hasOwn(condition, '$lte') && !(actual instanceof Date && actual <= condition.$lte)) return false;
            if (Object.hasOwn(condition, '$gt') && !(actual instanceof Date && actual > condition.$gt)) return false;
            if (Object.hasOwn(condition, '$exists') && (actual !== undefined) !== condition.$exists) return false;
            if (Object.keys(condition).some(operator => !['$lte', '$gt', '$exists'].includes(operator))) return false;
        } else if (actual instanceof Date && condition instanceof Date) {
            if (actual.getTime() !== condition.getTime()) return false;
        } else if (actual !== condition) return false;
    }
    return true;
};

const mockWebhookModel = (initial, serverNow = new Date('2026-03-01T00:00:00.000Z')) => {
    const state = { event: clone(initial), serverNow: new Date(serverNow) };
    return {
        state,
        findOneAndUpdate(filter, update) {
            return Promise.resolve().then(() => {
                state.lastFilter = clone(filter);
                if (!matchesMockFilter(state.event, filter, state.serverNow)) return null;
                state.lastUpdate = clone(update);
                if (Array.isArray(update)) {
                    const set = update[0].$set;
                    state.event.status = set.status;
                    state.event.processingToken = set.processingToken;
                    state.event.processingLeaseExpiresAt = new Date(state.serverNow.getTime() + set.processingLeaseExpiresAt.$add[1]);
                    state.event.attemptCount = (state.event.attemptCount || 0) + 1;
                    state.event.__v = (state.event.__v || 0) + set.__v.$add[1];
                    delete state.event[update[1].$unset];
                } else {
                    for (const [key, value] of Object.entries(update.$set || {})) state.event[key] = value;
                    for (const key of Object.keys(update.$unset || {})) delete state.event[key];
                    for (const [key, value] of Object.entries(update.$inc || {})) state.event[key] = (state.event[key] || 0) + value;
                    state.event.__v = (state.event.__v || 0) + 1;
                }
                return clone(state.event);
            });
        }
    };
};

const mockEvent = overrides => ({
    eventId: 'evt_race_001', eventType: 'payment.captured',
    payload: { paymentId: 'pay_mock_001' }, status: 'pending', attemptCount: 0, __v: 0,
    ...overrides
});

test('webhook query guard rejects pending directly transitioning to processed', async () => {
    const query = { getUpdate: () => ({ $set: { status: 'processed', processedAt: new Date() } }),
        getOptions: () => ({}), getQuery: () => ({ eventId: 'evt_race_001' }),
        model: { findOne: () => ({
            select: () => ({ lean: async () => ({ status: 'pending', __v: 0 }) })
        }) } };
    authorizeWebhookQuery(query, 'complete');
    await assert.rejects(
        hookFor(PaymentWebhookEvent, 'findOneAndUpdate', 'guardWebhookStateUpdate').call(query),
        /Invalid webhook event transition: pending -> processed/
    );
});

test('webhook claim middleware accepts only its exact server-time pipeline and adds the version CAS', async () => {
    const update = [
        { $set: {
            status: 'processing', processingToken: 'new-token',
            processingLeaseExpiresAt: { $add: ['$$NOW', 60_000] },
            attemptCount: { $add: [{ $ifNull: ['$attemptCount', 0] }, 1] },
            __v: { $add: [{ $ifNull: ['$__v', 0] }, 1] }
        } },
        { $unset: 'lastError' }
    ];
    const makeContext = candidate => ({
        getUpdate: () => candidate,
        getOptions: () => ({}),
        getQuery: () => ({ eventId: 'evt_race_001', $or: [{ status: 'pending' }] }),
        setQuery(next) { this.query = next; },
        model: { findOne: () => ({
            select: () => ({ lean: async () => ({ status: 'pending', __v: 4 }) })
        }) }
    });
    const valid = makeContext(update);
    authorizeWebhookQuery(valid, 'claim');
    await hookFor(PaymentWebhookEvent, 'findOneAndUpdate', 'guardWebhookStateUpdate').call(valid);
    assert.ok(valid.query.$and.some(clause => clause.status === 'pending' && clause.__v === 4));

    const invalid = structuredClone(update);
    invalid[0].$set.processingLeaseExpiresAt.$add[1] = 120_000;
    const invalidContext = makeContext(invalid);
    authorizeWebhookQuery(invalidContext, 'claim');
    await assert.rejects(
        hookFor(PaymentWebhookEvent, 'findOneAndUpdate', 'guardWebhookStateUpdate').call(invalidContext),
        /approved server-time update/
    );
});

test('only one competing worker claims a pending webhook event', async () => {
    const model = mockWebhookModel(mockEvent());
    const now = new Date('2026-03-01T00:00:00.000Z');
    const repository = createPaymentWebhookEventRepository(model);
    const [a, b] = await Promise.all([
        repository.claimWebhookEvent({ eventId: 'evt_race_001', now: new Date('2099-01-01'), leaseMs: 1 }),
        repository.claimWebhookEvent({ eventId: 'evt_race_001' })
    ]);
    assert.equal([a, b].filter(Boolean).length, 1);
    assert.equal(model.state.event.status, 'processing');
    assert.equal(model.state.event.attemptCount, 1);
    assert.match((a || b).processingToken, /^[0-9a-f-]{36}$/i);
    assert.deepEqual(model.state.lastUpdate[0].$set.processingLeaseExpiresAt, {
        $add: ['$$NOW', 60_000]
    });
    assert.ok(model.state.lastFilter.$or[2].$or.some(clause =>
        clause.$expr?.$lte?.[0] === '$processingLeaseExpiresAt'
            && clause.$expr?.$lte?.[1] === '$$NOW'
    ));
    assert.equal(model.state.event.processingLeaseExpiresAt.getTime() - model.state.serverNow.getTime(), 60_000);
});

test('expired webhook lease is reclaimed and old worker cannot complete it', async () => {
    const now = new Date('2026-03-01T00:02:00.000Z');
    const model = mockWebhookModel(mockEvent({
        status: 'processing', processingToken: 'worker-old',
        processingLeaseExpiresAt: new Date(now.getTime() - 1), attemptCount: 1
    }), now);
    const repository = createPaymentWebhookEventRepository(model);
    const reclaimed = await repository.claimWebhookEvent({ eventId: 'evt_race_001' });
    assert.equal(model.state.event.attemptCount, 2);
    assert.notEqual(reclaimed.processingToken, 'worker-old');
    assert.equal(await createClaimCompletion(model)({
        eventId: 'evt_race_001', processingToken: 'worker-old'
    }), null);
    assert.equal(model.state.event.status, 'processing');
    assert.equal(model.state.event.processingToken, reclaimed.processingToken);
});

test('wrong token cannot complete a webhook claim; failed event can be retried', async () => {
    const now = new Date('2026-03-01T00:00:00.000Z');
    const model = mockWebhookModel(mockEvent(), now);
    const repository = createPaymentWebhookEventRepository(model);
    const claim = await repository.claimWebhookEvent({ eventId: 'evt_race_001' });
    assert.equal(await createClaimCompletion(model)({
        eventId: 'evt_race_001', processingToken: 'wrong-token'
    }), null);
    const failed = await repository.failWebhookEvent({
        eventId: 'evt_race_001', processingToken: claim.processingToken,
        error: new Error('temporary failure')
    });
    assert.equal(failed.status, 'failed');
    const retried = await repository.retryWebhookEvent({ eventId: 'evt_race_001' });
    assert.equal(retried.event.status, 'processing');
    assert.equal(retried.event.attemptCount, 2);
});

test('successful webhook completion requires current token after business effects succeed', async () => {
    const now = new Date('2026-03-01T00:00:00.000Z');
    const model = mockWebhookModel(mockEvent(), now);
    const repository = createPaymentWebhookEventRepository(model);
    const claim = await repository.claimWebhookEvent({ eventId: 'evt_race_001' });
    const result = await createWebhookProcessor({
        fail: repository.failWebhookEvent,
        complete: createClaimCompletion(model)
    })({
        claim,
        applyBusinessEffects: async () => {
            assert.equal(model.state.event.status, 'processing');
            assert.equal(model.state.event.processingToken, claim.processingToken);
        }
    });
    assert.equal(result.status, 'processed');
    assert.deepEqual(model.state.lastFilter.$expr, {
        $gt: ['$processingLeaseExpiresAt', '$$NOW']
    });
    assert.equal(model.state.event.status, 'processed');
    assert.equal(model.state.event.attemptCount, 1);
});

test('business-effect failure leaves webhook event retryable and unprocessed', async () => {
    const now = new Date('2026-03-01T00:00:00.000Z');
    const model = mockWebhookModel(mockEvent(), now);
    const repository = createPaymentWebhookEventRepository(model);
    const claim = await repository.claimWebhookEvent({ eventId: 'evt_race_001' });
    let completionCalls = 0;
    const result = await createWebhookProcessor({
        fail: repository.failWebhookEvent,
        complete: async () => { completionCalls += 1; }
    })({
        claim,
        applyBusinessEffects: async () => { throw new Error('business effect failed'); }
    });
    assert.equal(result.status, 'failed');
    assert.equal(completionCalls, 0);
    assert.equal(model.state.event.status, 'failed');
    assert.equal(model.state.event.processedAt, undefined);
});

test('webhook processor completes only after successful business effects', async () => {
    const claim = { event: { eventId: 'evt_ok', payload: {} }, processingToken: 'opaque-token' };
    let completed = 0;
    const processor = createWebhookProcessor({
        fail: async () => null,
        complete: async input => { completed += 1; assert.equal(input.processingToken, 'opaque-token'); return { status: 'processed' }; }
    });
    const result = await processor({ claim, applyBusinessEffects: async () => { throw Error('failure'); } });
    assert.equal(result.status, 'lease_lost');
    assert.equal(completed, 0);
});

test('webhook processing errors are bounded and sanitized', () => {
    const event = validEvent({ lastError: 'Authorization: bearer-secret\nretry failed' });
    assert.equal(event.lastError, 'Authorization=[redacted] retry failed');
    assert.ok(event.lastError.length <= 500);
});

test('payment readiness accepts required declared indexes from both collections', async () => {
    assert.equal(await verifyPaymentIndexes(
        collectionWithIndexes(indexesFromRequirements(PAYMENT_REQUIRED_INDEXES)),
        collectionWithIndexes(indexesFromRequirements(WEBHOOK_REQUIRED_INDEXES))
    ), true);
});

test('payment readiness fails closed when a required payment or webhook index is missing', async () => {
    const paymentIndexes = indexesFromRequirements(PAYMENT_REQUIRED_INDEXES).slice(1);
    await assert.rejects(verifyPaymentIndexes(
        collectionWithIndexes(paymentIndexes),
        collectionWithIndexes(indexesFromRequirements(WEBHOOK_REQUIRED_INDEXES))
    ), /Payment indexes are missing/);

    await assert.rejects(verifyPaymentIndexes(
        collectionWithIndexes(indexesFromRequirements(PAYMENT_REQUIRED_INDEXES)),
        collectionWithIndexes(indexesFromRequirements(WEBHOOK_REQUIRED_INDEXES).slice(1))
    ), /PaymentWebhookEvent indexes are missing/);
});

test('payment readiness rejects incorrect uniqueness and partial filters', async () => {
    const paymentIndexes = indexesFromRequirements(PAYMENT_REQUIRED_INDEXES);
    paymentIndexes.find(index => index.key.razorpayOrderId)
        .partialFilterExpression.razorpayOrderId.$type = 'number';
    await assert.rejects(verifyPaymentIndexes(
        collectionWithIndexes(paymentIndexes),
        collectionWithIndexes(indexesFromRequirements(WEBHOOK_REQUIRED_INDEXES))
    ), /Payment indexes are missing/);

    const webhookIndexes = indexesFromRequirements(WEBHOOK_REQUIRED_INDEXES);
    webhookIndexes.find(index => index.key.eventId).unique = false;
    await assert.rejects(verifyPaymentIndexes(
        collectionWithIndexes(indexesFromRequirements(PAYMENT_REQUIRED_INDEXES)),
        collectionWithIndexes(webhookIndexes)
    ), /PaymentWebhookEvent indexes are missing/);
});
