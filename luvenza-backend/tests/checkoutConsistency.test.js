const assert = require('node:assert/strict');
const test = require('node:test');

const Cart = require('../models/cart');
const Order = require('../models/order');
const Product = require('../models/product');
const {
    placeOrder,
    recoverCheckoutClaimsAtStartup
} = require('../controllers/orderController');
const orderRoutes = require('../routes/orderRoutes');
const { verifyCheckoutIndex } = require('../config/checkoutIndexReadiness');
const { createHash } = require('node:crypto');

const customerA = '64b000000000000000000101';
const customerB = '64b000000000000000000102';
const productId = '64b000000000000000000201';

function makeResponse() {
    return {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
}

function queryResult(value) {
    return {
        select: async () => value,
        then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); }
    };
}

function makeHarness(t, options = {}) {
    const carts = new Map();
    const products = new Map();
    const orders = [];
    const calls = {
        clearedUsers: [],
        clearTokens: [],
        orderQueries: [],
        orderCreateAttempts: 0
    };
    const initialCart = options.cart === null ? null : {
        _id: '64b000000000000000000301',
        userId: customerA,
        __v: 0,
        items: [{ productId, quantity: 2, selectedSize: 'M' }]
    };
    if (options.expiredClaim) {
        initialCart.checkout = {
            key: options.expiredClaim.key,
            state: 'processing',
            processingToken: 'expired-worker',
            leaseExpiresAt: new Date(Date.now() - 1000),
            items: structuredClone(initialCart.items)
        };
    }
    if (initialCart) carts.set(customerA, initialCart);
    if (options.secondCart) carts.set(customerB, {
        _id: '64b000000000000000000302', userId: customerB, __v: 0,
        items: [{ productId, quantity: 1, selectedSize: 'S' }]
    });
    products.set(productId, options.product || {
        _id: productId,
        productName: 'Embroidered Top',
        pricing: { newPrice: 1200 },
        availableSizes: ['S', 'M', 'L']
    });

    const original = {
        findOne: Order.findOne,
        create: Order.create,
        cartFindOne: Cart.findOne,
        cartFind: Cart.find,
        cartFindOneAndUpdate: Cart.findOneAndUpdate,
        productFindById: Product.findById
    };
    t.after(() => {
        Order.findOne = original.findOne;
        Order.create = original.create;
        Cart.findOne = original.cartFindOne;
        Cart.find = original.cartFind;
        Cart.findOneAndUpdate = original.cartFindOneAndUpdate;
        Product.findById = original.productFindById;
    });

    Cart.findOne = filter => {
        const cart = carts.get(String(filter.userId));
        if (!cart) return queryResult(null);
        if (filter['checkout.key'] && filter['checkout.key'] !== cart.checkout?.key) {
            return queryResult(null);
        }
        if (filter['checkout.state'] && filter['checkout.state'] !== cart.checkout?.state) {
            return queryResult(null);
        }
        if (filter['checkout.committedOrderId']
            && String(filter['checkout.committedOrderId'])
                !== String(cart.checkout?.committedOrderId)) {
            return queryResult(null);
        }
        return queryResult(cart);
    };
    Cart.find = () => queryResult([...carts.values()].filter(cart => cart.checkout?.key));
    Cart.findOneAndUpdate = (filter, update) => {
        const current = carts.get(String(filter.userId));
        if (!current) return queryResult(null);

        if (filter.checkout?.$exists === false) {
            if (current.checkout || current._id !== filter._id
                || current.__v !== filter.__v || !current.items.length) {
                return queryResult(null);
            }
            current.checkout = structuredClone(update.$set.checkout);
            current.__v += 1;
            return queryResult(structuredClone(current));
        }

        if (filter['checkout.key'] !== current.checkout?.key) return queryResult(null);
        if (filter.$and) {
            if (current.checkout.state === 'committed') return queryResult(null);
            const leaseClause = filter.$and.find(clause => clause.$or?.some(item =>
                item['checkout.leaseExpiresAt']
            ));
            const expiry = current.checkout.leaseExpiresAt
                ? new Date(current.checkout.leaseExpiresAt)
                : null;
            const cutoff = leaseClause.$or[0]['checkout.leaseExpiresAt'].$lte;
            const expired = !expiry || expiry <= cutoff;
            if (!expired) return queryResult(null);
            current.checkout.state = 'processing';
            current.checkout.processingToken = update.$set['checkout.processingToken'];
            current.checkout.leaseExpiresAt = update.$set['checkout.leaseExpiresAt'];
            current.__v += 1;
            return queryResult(structuredClone(current));
        }
        const expiration = current.checkout.leaseExpiresAt
            ? new Date(current.checkout.leaseExpiresAt)
            : null;
        if (filter['checkout.state'] && filter['checkout.state'] !== current.checkout.state) {
            return queryResult(null);
        }
        if (filter['checkout.processingToken']
            && filter['checkout.processingToken'] !== current.checkout.processingToken) {
            return queryResult(null);
        }
        if (filter['checkout.committedOrderId']
            && String(filter['checkout.committedOrderId'])
                !== String(current.checkout.committedOrderId)) {
            return queryResult(null);
        }
        const leaseLimit = filter['checkout.leaseExpiresAt']?.$gt;
        if (leaseLimit && (!expiration || expiration <= leaseLimit)) return queryResult(null);
        if (update.$set?.['checkout.state'] === 'committed') {
            Object.assign(current.checkout, {
                state: 'committed',
                committedOrderId: String(update.$set['checkout.committedOrderId']),
                committedItems: structuredClone(update.$set['checkout.committedItems']),
                committedTotalAmount: update.$set['checkout.committedTotalAmount']
            });
            return queryResult(structuredClone(current));
        }
        if (update.$set?.['checkout.leaseExpiresAt']) {
            current.checkout.leaseExpiresAt = update.$set['checkout.leaseExpiresAt'];
        }
        if (update.$set?.items) {
            if (options.clearReturnsNull) return queryResult(null);
            if (options.clearErrorOnce) {
                options.clearErrorOnce = false;
                throw new Error('cart write unavailable');
            }
            current.items = [];
            calls.clearedUsers.push(String(filter.userId));
            calls.clearTokens.push(filter['checkout.processingToken']);
        }
        if (update.$unset?.checkout) delete current.checkout;
        current.__v += 1;
        return queryResult(structuredClone(current));
    };

    Product.findById = async id => options.productLookup
        ? options.productLookup(id, products)
        : products.get(String(id)) || null;
    Order.findOne = filter => {
        calls.orderQueries.push(filter);
        return queryResult(orders.find(order =>
            String(order.customerId) === String(filter.customerId)
            && order.checkoutKey === filter.checkoutKey
        ) || null);
    };
    Order.create = async payload => {
        calls.orderCreateAttempts += 1;
        if (options.createError) throw options.createError;
        if (options.duplicateAfterPersist) {
            options.duplicateAfterPersist = false;
            orders.push(options.duplicateOrder
                ? options.duplicateOrder(structuredClone(payload))
                : { ...structuredClone(payload) });
            const error = new Error('duplicate key');
            error.code = 11000;
            throw error;
        }
        if (orders.some(order => String(order._id) === String(payload._id)
            || (String(order.customerId) === String(payload.customerId)
                && order.checkoutKey === payload.checkoutKey))) {
            const error = new Error('duplicate key');
            error.code = 11000;
            throw error;
        }
        const order = { _id: `order-${orders.length + 1}`, ...structuredClone(payload) };
        orders.push(order);
        return structuredClone(order);
    };

    const invoke = async (userId = customerA, headers = {}, body = {}) => {
        const req = {
            user: { _id: userId },
            headers,
            body,
            get(name) { return headers[name.toLowerCase()]; }
        };
        const res = makeResponse();
        await placeOrder(req, res);
        return res;
    };

    return { invoke, carts, products, orders, calls };
}

const makeCommittedIntent = () => ({
    key: 'committed-intent-key',
    state: 'committed',
    processingToken: 'committed-worker',
    leaseExpiresAt: new Date(Date.now() - 60_000),
    committedOrderId: '64b000000000000000000499',
    committedItems: [{
        productId,
        productName: 'Embroidered Top',
        quantity: 2,
        selectedSize: 'M',
        unitPrice: 1200,
        itemTotal: 2400
    }],
    committedTotalAmount: 2400
});

const makeOrderFromIntent = (intent, overrides = {}) => ({
    _id: intent.committedOrderId,
    customerId: customerA,
    checkoutKey: intent.key,
    items: structuredClone(intent.committedItems),
    totalAmount: intent.committedTotalAmount,
    status: 'Pending',
    ...overrides
});

const attachCommittedIntent = harness => {
    const cart = harness.carts.get(customerA);
    cart.checkout = makeCommittedIntent();
    return cart;
};

test('successful checkout creates a Pending order from database price and clears only its owner cart', async t => {
    const h = makeHarness(t, { secondCart: true });
    const response = await h.invoke(customerA, {}, {
        customerId: customerB, totalAmount: 1, status: 'Paid', items: []
    });

    assert.equal(response.statusCode, 201);
    assert.equal(response.body.order.totalAmount, 2400);
    assert.equal(response.body.order.items[0].unitPrice, 1200);
    assert.equal(response.body.order.status, 'Pending');
    assert.equal(Object.hasOwn(response.body.order, 'checkoutKey'), false);
    assert.deepEqual(h.carts.get(customerA).items, []);
    assert.equal(h.carts.get(customerB).items.length, 1);
    assert.deepEqual(h.calls.clearedUsers, [customerA]);
});

test('empty cart is rejected without creating an order', async t => {
    const h = makeHarness(t, { cart: null });
    const response = await h.invoke();
    assert.equal(response.statusCode, 400);
    assert.equal(h.orders.length, 0);
});

test('deleted product or unavailable size is rejected and cart contents are preserved', async t => {
    const missing = makeHarness(t);
    missing.products.delete(productId);
    const missingResponse = await missing.invoke();
    assert.equal(missingResponse.statusCode, 400);
    assert.equal(missing.orders.length, 0);
    assert.equal(missing.carts.get(customerA).items.length, 1);
    assert.equal(missing.carts.get(customerA).checkout, undefined);

    const unavailable = makeHarness(t, { product: {
        _id: productId, productName: 'Top', pricing: { newPrice: 10 }, availableSizes: ['S']
    } });
    const unavailableResponse = await unavailable.invoke();
    assert.equal(unavailableResponse.statusCode, 400);
    assert.equal(unavailable.orders.length, 0);
});

test('invalid cart quantity is rejected without clearing cart', async t => {
    const h = makeHarness(t);
    h.carts.get(customerA).items[0].quantity = 0;
    const response = await h.invoke();
    assert.equal(response.statusCode, 400);
    assert.equal(h.carts.get(customerA).items.length, 1);
});

test('client-supplied price, totals, status and owner fields are ignored', async t => {
    const h = makeHarness(t);
    const response = await h.invoke(customerA, {}, {
        customerId: customerB, unitPrice: 0.01, totalAmount: 0.01, status: 'Paid'
    });
    assert.equal(response.body.order.customerId, customerA);
    assert.equal(response.body.order.totalAmount, 2400);
    assert.equal(response.body.order.items[0].unitPrice, 1200);
    assert.equal(response.body.order.status, 'Pending');
});

test('a customer cannot check out another customer cart', async t => {
    const h = makeHarness(t);
    const response = await h.invoke(customerB);
    assert.equal(response.statusCode, 400);
    assert.match(response.body.message, /empty/i);
    assert.equal(h.orders.length, 0);
    assert.equal(h.carts.get(customerA).items.length, 1);
});

test('repeated idempotency key returns the same order without duplicate creation', async t => {
    const h = makeHarness(t);
    const first = await h.invoke(customerA, { 'idempotency-key': 'checkout-123' });
    const second = await h.invoke(customerA, { 'idempotency-key': 'checkout-123' });
    assert.equal(first.statusCode, 201);
    assert.equal(second.statusCode, 200);
    assert.equal(second.body.order._id, first.body.order._id);
    assert.equal(h.orders.length, 1);
});

test('order persistence failure preserves cart items and its recovery claim', async t => {
    const h = makeHarness(t, { createError: new Error('database unavailable') });
    const response = await h.invoke();
    assert.equal(response.statusCode, 500);
    assert.equal(h.carts.get(customerA).items.length, 1);
    assert.ok(h.carts.get(customerA).checkout.key);
});

test('retry recovers a persisted order and completes cart clearing after a cart-write failure', async t => {
    const h = makeHarness(t, { clearErrorOnce: true });
    const headers = { 'idempotency-key': 'recover-checkout' };
    const first = await h.invoke(customerA, headers);
    assert.equal(first.statusCode, 500);
    assert.equal(h.orders.length, 1);
    assert.equal(h.carts.get(customerA).items.length, 1);
    assert.ok(h.carts.get(customerA).checkout.key);

    h.carts.get(customerA).checkout.leaseExpiresAt = new Date(Date.now() - 1000);
    const retry = await h.invoke(customerA, headers);
    assert.equal(retry.statusCode, 200);
    assert.equal(retry.body.order._id, h.orders[0]._id);
    assert.equal(h.orders.length, 1);
    assert.deepEqual(h.carts.get(customerA).items, []);
    assert.equal(h.carts.get(customerA).checkout, undefined);
});

test('checkout does not report success when conditional cart clearing matches no record', async t => {
    const h = makeHarness(t, { clearReturnsNull: true });
    const response = await h.invoke();
    assert.equal(response.statusCode, 500);
    assert.equal(response.body.success, false);
    assert.equal(h.orders.length, 1);
    assert.equal(h.carts.get(customerA).items.length, 1);
});

test('only one concurrent handler acquires an active checkout claim', async t => {
    const h = makeHarness(t);
    const responses = await Promise.all([h.invoke(), h.invoke()]);
    assert.equal(responses.filter(response => response.statusCode === 201).length, 1);
    assert.equal(responses.filter(response => response.statusCode === 409).length, 1);
    assert.equal(h.orders.length, 1);
    assert.deepEqual(h.carts.get(customerA).items, []);
    assert.equal(h.calls.clearedUsers.length, 1);
});

test('a worker with a stale token cannot release a newer worker claim', async t => {
    let signalLookupStarted;
    let resolveProduct;
    const lookupStarted = new Promise(resolve => { signalLookupStarted = resolve; });
    const h = makeHarness(t, {
        productLookup: () => {
            signalLookupStarted();
            return new Promise(resolve => { resolveProduct = resolve; });
        }
    });
    const request = h.invoke();
    await lookupStarted;
    const cart = h.carts.get(customerA);
    const staleToken = cart.checkout.processingToken;
    cart.checkout.processingToken = 'new-worker-token';
    cart.checkout.leaseExpiresAt = new Date(Date.now() + 60_000);
    resolveProduct({
        _id: productId, productName: 'Top', pricing: { newPrice: 10 }, availableSizes: ['S']
    });

    const response = await request;
    assert.equal(response.statusCode, 409);
    assert.equal(h.orders.length, 0);
    assert.equal(cart.checkout.processingToken, 'new-worker-token');
    assert.notEqual(cart.checkout.processingToken, staleToken);
});

test('a stale handler cannot create an order after it loses ownership', async t => {
    let signalLookupStarted;
    let resolveProduct;
    const lookupStarted = new Promise(resolve => { signalLookupStarted = resolve; });
    const h = makeHarness(t, {
        productLookup: () => {
            signalLookupStarted();
            return new Promise(resolve => { resolveProduct = resolve; });
        }
    });
    const request = h.invoke();
    await lookupStarted;
    const cart = h.carts.get(customerA);
    cart.checkout.processingToken = 'replacement-worker';
    cart.checkout.leaseExpiresAt = new Date(Date.now() + 60_000);
    resolveProduct({
        _id: productId,
        productName: 'Top',
        pricing: { newPrice: 25.00 },
        availableSizes: ['M']
    });

    const response = await request;
    assert.equal(response.statusCode, 409);
    assert.equal(h.orders.length, 0);
});

test('worker B reclaims an expired claim, commits the current price, and fences worker A', async t => {
    let signalFirstLookup;
    let releaseFirstLookup;
    let lookupCount = 0;
    const firstLookupStarted = new Promise(resolve => { signalFirstLookup = resolve; });
    const h = makeHarness(t, {
        productLookup: (id, products) => {
            lookupCount += 1;
            if (lookupCount === 1) {
                signalFirstLookup();
                return new Promise(resolve => { releaseFirstLookup = resolve; });
            }
            return Promise.resolve(products.get(String(id)));
        }
    });

    const workerARequest = h.invoke();
    await firstLookupStarted;
    const cart = h.carts.get(customerA);
    const workerAToken = cart.checkout.processingToken;
    cart.checkout.leaseExpiresAt = new Date(Date.now() - 1000);
    h.products.set(productId, {
        _id: productId,
        productName: 'Embroidered Top',
        pricing: { newPrice: 1500 },
        availableSizes: ['S', 'M', 'L']
    });

    const workerBResponse = await h.invoke();
    assert.equal(workerBResponse.statusCode, 201);
    assert.equal(workerBResponse.body.order.totalAmount, 3000);
    assert.equal(workerBResponse.body.order.items[0].unitPrice, 1500);
    assert.deepEqual(cart.items, []);

    releaseFirstLookup({
        _id: productId,
        productName: 'Embroidered Top',
        pricing: { newPrice: 1200 },
        availableSizes: ['S', 'M', 'L']
    });
    const workerAResponse = await workerARequest;

    assert.equal(workerAResponse.statusCode, 409);
    assert.equal(h.orders.length, 1);
    assert.equal(h.calls.orderCreateAttempts, 1);
    assert.equal(h.orders[0].items[0].unitPrice, 1500);
    assert.equal(cart.checkout, undefined);
    assert.equal(h.calls.clearTokens.includes(workerAToken), false);
});

test('two recovery workers materialize one committed order from the same immutable intent', async t => {
    const key = createHash('sha256').update(`${customerA}:committed-attempt`).digest('hex');
    const h = makeHarness(t);
    const cart = h.carts.get(customerA);
    cart.checkout = {
        key,
        state: 'committed',
        processingToken: 'commit-owner',
        leaseExpiresAt: new Date(Date.now() - 60_000),
        committedOrderId: '64b000000000000000000401',
        committedItems: [{
            productId,
            productName: 'Embroidered Top',
            quantity: 2,
            selectedSize: 'M',
            unitPrice: 1200,
            itemTotal: 2400
        }],
        committedTotalAmount: 2400
    };

    const responses = await Promise.all([h.invoke(), h.invoke()]);
    assert.ok(responses.every(response => [200, 201].includes(response.statusCode)));
    assert.equal(h.orders.length, 1);
    assert.equal(h.calls.orderCreateAttempts, 2);
    assert.equal(String(h.orders[0]._id), '64b000000000000000000401');
    assert.deepEqual(cart.items, []);
    assert.equal(cart.checkout, undefined);
});

test('committed recovery accepts an existing order only when identity and full snapshot match', async t => {
    const h = makeHarness(t);
    const cart = attachCommittedIntent(h);
    h.orders.push(makeOrderFromIntent(cart.checkout));

    const response = await h.invoke();

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.order._id, '64b000000000000000000499');
    assert.deepEqual(cart.items, []);
    assert.equal(cart.checkout, undefined);
});

test('committed recovery rejects mismatched order identity or required snapshot fields without clearing cart', async t => {
    const cases = [
        ['wrong customer ID', (order, intent) => { order.customerId = customerB; }],
        ['wrong checkout key', order => { order.checkoutKey = 'different-key'; }],
        ['wrong order ID', order => { order._id = '64b000000000000000000498'; }],
        ['different item quantity', order => { order.items[0].quantity = 3; }],
        ['different product ID', order => { order.items[0].productId = '64b000000000000000000202'; }],
        ['different size', order => { order.items[0].selectedSize = 'L'; }],
        ['different unit price', order => { order.items[0].unitPrice = 1300; }],
        ['different item total', order => { order.items[0].itemTotal = 2600; }],
        ['different order total', order => { order.totalAmount = 2600; }],
        ['missing required item field', order => { delete order.items[0].quantity; }],
        ['missing required order field', order => { delete order.totalAmount; }]
    ];

    for (const [name, mutateOrder] of cases) {
        await t.test(name, async t => {
            const h = makeHarness(t);
            const cart = attachCommittedIntent(h);
            const order = makeOrderFromIntent(cart.checkout);
            mutateOrder(order, cart.checkout);
            h.orders.push(order);

            const response = await h.invoke();

            assert.equal(response.statusCode, 500);
            assert.equal(response.body.success, false);
            assert.equal(h.calls.clearedUsers.length, 0);
            assert.equal(cart.checkout.state, 'committed');
            assert.equal(cart.checkout.committedOrderId, '64b000000000000000000499');
            assert.equal(cart.items.length, 1);
        });
    }
});

test('duplicate-key recovery rejects a conflicting order and preserves committed cart', async t => {
    const h = makeHarness(t, {
        duplicateAfterPersist: true,
        duplicateOrder: order => ({
            ...order,
            items: [{ ...order.items[0], unitPrice: order.items[0].unitPrice + 1 }]
        })
    });

    const response = await h.invoke();
    const cart = h.carts.get(customerA);

    assert.equal(response.statusCode, 500);
    assert.equal(response.body.success, false);
    assert.equal(h.orders.length, 1);
    assert.equal(h.calls.clearedUsers.length, 0);
    assert.equal(cart.checkout.state, 'committed');
    assert.equal(cart.items.length, 1);
});

test('startup recovery rejects a conflicting committed order and preserves the intent and cart', async t => {
    const h = makeHarness(t);
    const cart = attachCommittedIntent(h);
    const conflictingOrder = makeOrderFromIntent(cart.checkout);
    conflictingOrder.totalAmount += 1;
    h.orders.push(conflictingOrder);

    await assert.rejects(recoverCheckoutClaimsAtStartup(), /committed checkout intent/);

    assert.equal(h.calls.clearedUsers.length, 0);
    assert.equal(cart.checkout.state, 'committed');
    assert.equal(cart.items.length, 1);
});

test('expired claims are atomically reclaimed and retain their original idempotency key', async t => {
    const key = createHash('sha256').update(`${customerA}:expired-attempt`).digest('hex');
    const h = makeHarness(t, { expiredClaim: { key } });
    const response = await h.invoke(customerA, { 'idempotency-key': 'expired-attempt' });
    assert.equal(response.statusCode, 201);
    assert.equal(h.orders[0].checkoutKey, key);
    assert.equal(h.carts.get(customerA).checkout, undefined);
});

test('startup recovery releases an expired uncommitted claim without losing cart items', async t => {
    const h = makeHarness(t, { expiredClaim: { key: 'expired-uncommitted-key' } });
    await recoverCheckoutClaimsAtStartup();
    assert.equal(h.carts.get(customerA).checkout, undefined);
    assert.equal(h.carts.get(customerA).items.length, 1);
    assert.equal(h.orders.length, 0);
});

test('startup recovery materializes and clears a committed order after a server restart', async t => {
    const h = makeHarness(t);
    const cart = h.carts.get(customerA);
    cart.checkout = {
        key: 'committed-restart-key',
        state: 'committed',
        processingToken: 'committed-worker',
        leaseExpiresAt: new Date(Date.now() - 60_000),
        committedOrderId: '64b000000000000000000402',
        committedItems: [{
            productId,
            productName: 'Embroidered Top',
            quantity: 2,
            selectedSize: 'M',
            unitPrice: 1200,
            itemTotal: 2400
        }],
        committedTotalAmount: 2400
    };

    await recoverCheckoutClaimsAtStartup();
    assert.equal(h.orders.length, 1);
    assert.equal(h.orders[0].checkoutKey, 'committed-restart-key');
    assert.equal(cart.checkout, undefined);
    assert.deepEqual(cart.items, []);
});

test('duplicate-key error reloads the winning order and completes owned cart clearing', async t => {
    const h = makeHarness(t, { duplicateAfterPersist: true });
    const response = await h.invoke();
    assert.equal(response.statusCode, 200);
    assert.equal(h.orders.length, 1);
    assert.equal(h.orders[0].status, 'Pending');
    assert.deepEqual(h.carts.get(customerA).items, []);
});

test('order totals are summed from current product prices and cart quantities', async t => {
    const h = makeHarness(t, { product: {
        _id: productId, productName: 'Top', pricing: { newPrice: 1999.5 }, availableSizes: ['M']
    } });
    const response = await h.invoke();
    assert.equal(response.body.order.items[0].itemTotal, 3999);
    assert.equal(response.body.order.totalAmount, 3999);
});

test('currency values are rounded to two minor units before multiplication and summation', async t => {
    const h = makeHarness(t, { product: {
        _id: productId, productName: 'Top', pricing: { newPrice: 1.005 }, availableSizes: ['M']
    } });
    const response = await h.invoke();
    assert.equal(response.body.order.items[0].unitPrice, 1.01);
    assert.equal(response.body.order.items[0].itemTotal, 2.02);
    assert.equal(response.body.order.totalAmount, 2.02);
});

test('cart schema protects checkout claims and order idempotency index is customer scoped', () => {
    assert.equal(Cart.schema.options.optimisticConcurrency, true);
    assert.equal(Cart.schema.path('checkout').options.select, false);
    assert.equal(Order.schema.options.autoIndex, false);
    const checkoutIndex = Order.schema.indexes().find(([fields, options]) =>
        fields.customerId === 1 && fields.checkoutKey === 1 && options.unique
    );
    assert.ok(checkoutIndex);
    assert.deepEqual(checkoutIndex[1].partialFilterExpression, {
        checkoutKey: { $type: 'string' }
    });
});

test('checkout index readiness fails closed when the required unique index is absent', async () => {
    const collection = { listIndexes: () => ({ toArray: async () => [
        { name: '_id_', key: { _id: 1 } }
    ] }) };
    await assert.rejects(verifyCheckoutIndex(collection), /Checkout is disabled/);
});

test('checkout index readiness accepts only the customer-scoped unique partial index', async () => {
    const collection = { listIndexes: () => ({ toArray: async () => [
        {
            name: 'customerId_1_checkoutKey_1',
            key: { customerId: 1, checkoutKey: 1 },
            unique: true,
            partialFilterExpression: { checkoutKey: { $type: 'string' } }
        }
    ] }) };
    assert.equal(await verifyCheckoutIndex(collection), true);
});

test('checkout index readiness rejects a narrower partial filter', async () => {
    const collection = { listIndexes: () => ({ toArray: async () => [
        {
            name: 'incomplete-checkout-index',
            key: { customerId: 1, checkoutKey: 1 },
            unique: true,
            partialFilterExpression: {
                checkoutKey: { $type: 'string' },
                customerId: { $exists: true }
            }
        }
    ] }) };
    await assert.rejects(verifyCheckoutIndex(collection), /Checkout is disabled/);
});

test('checkout route rejects non-customer roles before invoking placeOrder', () => {
    const route = orderRoutes.stack.find(layer => layer.route?.path === '/').route;
    const handlers = route.stack.map(layer => layer.handle);
    assert.equal(handlers.at(-1), placeOrder);
    assert.equal(handlers.length, 3);

    const response = makeResponse();
    let nextCalled = false;
    handlers[1]({ user: { role: 'admin' } }, response, () => { nextCalled = true; });
    assert.equal(response.statusCode, 403);
    assert.equal(nextCalled, false);

    handlers[1]({ user: { role: 'customer' } }, makeResponse(), () => { nextCalled = true; });
    assert.equal(nextCalled, true);
});
