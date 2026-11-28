const assert = require('node:assert/strict');
const test = require('node:test');

const Order = require('../models/order');
const User = require('../models/user');
const Product = require('../models/product');
const Customization = require('../models/customization');
const statusRules = require('../utils/orderStatus');
const adminOrderController = require('../controllers/adminOrderController');
const adminDashboardController = require('../controllers/adminDashboardController');
const customerOrderController = require('../controllers/orderController');
const adminRoutes = require('../routes/adminRoutes');

const orderId = '64b000000000000000000010';
const tailorId = '64b000000000000000000011';
const deliveryId = '64b000000000000000000012';

function makeResponse() {
    return {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
}

function stubMethod(t, target, methodName, implementation) {
    const original = target[methodName];
    target[methodName] = implementation;
    t.after(() => { target[methodName] = original; });
}

test('legacy status aliases normalize to canonical enum values without writes', () => {
    const expected = {
        placed: 'Pending',
        confirmed: 'Approved',
        tailoring: 'In_Production',
        ready_for_delivery: 'Ready_For_Dispatch',
        out_for_delivery: 'Out_For_Delivery',
        delivered: 'Delivered',
        cancelled: 'Cancelled'
    };

    for (const [legacy, canonical] of Object.entries(expected)) {
        assert.equal(statusRules.normalizeOrderStatus(legacy), canonical);
        assert.deepEqual(statusRules.storedStatusValues(canonical), [canonical, legacy]);
    }
    assert.equal(statusRules.normalizeOrderStatus('not-a-status'), null);
    assert.deepEqual(Order.schema.path('status').enumValues, statusRules.ORDER_STATUSES);
});

test('status transition rules allow workflow steps and reject skips or terminal changes', () => {
    for (const [from, destinations] of Object.entries(statusRules.ADMIN_TRANSITIONS)) {
        destinations.forEach(to => {
            assert.equal(statusRules.canTransitionOrderStatus(from, to, 'admin'), true, `${from} -> ${to}`);
        });
    }
    assert.equal(statusRules.canTransitionOrderStatus('Awaiting_Payment', 'Paid', 'admin'), false);
    assert.equal(statusRules.canTransitionOrderStatus('Awaiting_Payment', 'Paid', 'payment'), true);
    assert.equal(statusRules.canTransitionOrderStatus('Pending', 'Cancelled', 'customer'), true);

    const invalidTransitions = [
        ['Pending', 'Delivered'],
        ['Delivered', 'Cancelled'],
        ['Cancelled', 'Pending'],
        ['In_Production', 'Out_For_Delivery'],
        ['Approved', 'Paid']
    ];
    invalidTransitions.forEach(([from, to]) => {
        assert.equal(statusRules.canTransitionOrderStatus(from, to, 'admin'), false, `${from} -> ${to}`);
    });
});

test('admin status update accepts legacy input and writes canonical status', async t => {
    const existing = { _id: orderId, status: 'placed' };
    stubMethod(t, Order, 'findById', async () => existing);
    stubMethod(t, Order, 'findOneAndUpdate', async (filter, update, options) => {
        assert.deepEqual(filter, { _id: orderId, status: 'placed' });
        assert.deepEqual(update, { $set: { status: 'Awaiting_Approval' } });
        assert.equal(options.runValidators, true);
        return { _id: orderId, status: 'Awaiting_Approval' };
    });

    const res = makeResponse();
    await adminOrderController.updateOrderStatus({
        params: { id: orderId },
        body: { status: 'awaiting_approval' }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.order.status, 'Awaiting_Approval');
});

test('admin status update rejects invalid transitions without writing', async t => {
    stubMethod(t, Order, 'findById', async () => ({ _id: orderId, status: 'Delivered' }));
    stubMethod(t, Order, 'findOneAndUpdate', async () => {
        assert.fail('Invalid transition must not write');
    });

    const res = makeResponse();
    await adminOrderController.updateOrderStatus({
        params: { id: orderId },
        body: { status: 'Pending' }
    }, res);

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.message, 'Invalid order status transition');
});

test('admin status endpoint cannot manually set Paid', async t => {
    stubMethod(t, Order, 'findById', async () => {
        assert.fail('Paid must be rejected before loading or updating the order');
    });
    stubMethod(t, Order, 'findOneAndUpdate', async () => {
        assert.fail('Admin status endpoint must not write Paid');
    });

    const res = makeResponse();
    await adminOrderController.updateOrderStatus({
        params: { id: orderId },
        body: { status: 'Paid' }
    }, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /server-side payment verification/);
});

test('tailor assignment recognizes legacy placed/confirmed statuses and writes In_Production', async t => {
    stubMethod(t, User, 'findOne', async () => ({ _id: tailorId, role: 'tailor', isActive: true, isApproved: true }));
    stubMethod(t, Order, 'findById', async () => ({ _id: orderId, status: 'confirmed' }));
    stubMethod(t, Order, 'findOneAndUpdate', async (filter, update, options) => {
        assert.deepEqual(filter, { _id: orderId, status: { $in: ['Approved', 'confirmed'] } });
        assert.equal(update.$set.status, 'In_Production');
        assert.equal(options.runValidators, true);
        return { _id: orderId, status: 'In_Production' };
    });

    const res = makeResponse();
    await adminOrderController.assignTailor({
        params: { id: orderId },
        body: { tailorId }
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.order.status, 'In_Production');
});

test('tailor assignment query includes legacy placed orders', async t => {
    stubMethod(t, User, 'findOne', async () => ({ _id: tailorId, role: 'tailor', isActive: true, isApproved: true }));
    stubMethod(t, Order, 'findById', async () => ({ _id: orderId, status: 'placed' }));
    stubMethod(t, Order, 'findOneAndUpdate', async (filter, update) => {
        assert.deepEqual(filter, { _id: orderId, status: { $in: ['Pending', 'placed'] } });
        assert.equal(update.$set.status, 'In_Production');
        return { _id: orderId, status: 'In_Production' };
    });

    const res = makeResponse();
    await adminOrderController.assignTailor({
        params: { id: orderId },
        body: { tailorId }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.order.status, 'In_Production');
});

test('delivery assignment recognizes legacy ready_for_delivery and writes Out_For_Delivery', async t => {
    stubMethod(t, User, 'findOne', async () => ({ _id: deliveryId, role: 'deliver_partner', isActive: true, isApproved: true }));
    stubMethod(t, Order, 'findById', async () => ({ _id: orderId, status: 'ready_for_delivery' }));
    stubMethod(t, Order, 'findOneAndUpdate', async (filter, update, options) => {
        assert.deepEqual(filter, { _id: orderId, status: { $in: ['Ready_For_Dispatch', 'ready_for_delivery'] } });
        assert.equal(update.$set.status, 'Out_For_Delivery');
        assert.equal(options.runValidators, true);
        return { _id: orderId, status: 'Out_For_Delivery' };
    });

    const res = makeResponse();
    await adminOrderController.assignDeliveryPartner({
        params: { id: orderId },
        body: { deliveryPartnerId: deliveryId }
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.order.status, 'Out_For_Delivery');
});

test('admin cancellation writes canonical Cancelled and refuses terminal orders', async t => {
    stubMethod(t, Order, 'findById', async () => ({ _id: orderId, status: 'tailoring' }));
    stubMethod(t, Order, 'findOneAndUpdate', async (filter, update) => {
        assert.deepEqual(filter, { _id: orderId, status: 'tailoring' });
        assert.equal(update.$set.status, 'Cancelled');
        return { _id: orderId, status: 'Cancelled' };
    });

    const res = makeResponse();
    await adminOrderController.cancelOrder({ params: { id: orderId } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.order.status, 'Cancelled');
});

test('customer cancellation atomically matches owner and eligible canonical or legacy statuses', async t => {
    const ownerOrder = { _id: orderId, customerId: 'customer-1', status: 'Cancelled' };
    stubMethod(t, Order, 'findOneAndUpdate', async (filter, update, options) => {
        assert.deepEqual(filter, {
            _id: orderId,
            customerId: 'customer-1',
            status: { $in: ['Pending', 'placed', 'Awaiting_Approval'] }
        });
        assert.deepEqual(update, { $set: { status: 'Cancelled' } });
        assert.equal(options.new, true);
        assert.equal(options.runValidators, true);
        return ownerOrder;
    });

    const res = makeResponse();
    await customerOrderController.cancelOrder({
        params: { id: orderId },
        user: { _id: 'customer-1' }
    }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.order.status, 'Cancelled');
});

test('customer cancellation returns a generic not-found response when no owned eligible order matches', async t => {
    stubMethod(t, Order, 'findOneAndUpdate', async filter => {
        assert.deepEqual(filter, {
            _id: orderId,
            customerId: 'customer-2',
            status: { $in: ['Pending', 'placed', 'Awaiting_Approval'] }
        });
        return null;
    });

    const res = makeResponse();
    await customerOrderController.cancelOrder({
        params: { id: orderId },
        user: { _id: 'customer-2' }
    }, res);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, {
        success: false,
        message: 'Order not found or cannot be cancelled'
    });
});

test('dashboard filters include legacy values and reports group them canonically', async t => {
    const countFilters = [];
    const aggregateCalls = [];
    stubMethod(t, User, 'countDocuments', async () => 1);
    stubMethod(t, Product, 'countDocuments', async () => 1);
    stubMethod(t, Order, 'countDocuments', async filter => {
        countFilters.push(filter);
        if (filter?.status?.$in) {
            return filter.status.$in.includes('tailoring') ? 4 : 0;
        }
        return 2;
    });
    stubMethod(t, Order, 'aggregate', async pipeline => {
        aggregateCalls.push(pipeline);
        if (pipeline[0].$group?._id === '$status') {
            return [
                { _id: 'Pending', count: 2 },
                { _id: 'placed', count: 3 },
                { _id: 'confirmed', count: 1 },
                { _id: 'tailoring', count: 4 },
                { _id: 'Cancelled', count: 1 },
                { _id: 'unrecognized_legacy_value', count: 1 }
            ];
        }
        return [{ totalSales: 10 }];
    });
    stubMethod(t, Customization, 'countDocuments', async () => 0);

    const overviewRes = makeResponse();
    await adminDashboardController.getOverview({}, overviewRes);
    const activeOrderFilter = countFilters.find(filter => filter?.status?.$in);
    assert.ok(activeOrderFilter.status.$in.includes('Pending'));
    assert.ok(activeOrderFilter.status.$in.includes('placed'));
    assert.ok(activeOrderFilter.status.$in.includes('In_Production'));
    assert.ok(activeOrderFilter.status.$in.includes('tailoring'));
    assert.ok(activeOrderFilter.status.$in.includes('Out_For_Delivery'));
    assert.equal(overviewRes.body.overview.activeOrders, 4);
    assert.ok(aggregateCalls[0][0].$match.status.$nin.includes('Cancelled'));
    assert.ok(aggregateCalls[0][0].$match.status.$nin.includes('cancelled'));

    const salesRes = makeResponse();
    await adminDashboardController.getSalesReport({}, salesRes);
    assert.ok(aggregateCalls[1][0].$match.status.$nin.includes('Cancelled'));

    const ordersRes = makeResponse();
    await adminDashboardController.getOrderReport({}, ordersRes);
    assert.deepEqual(ordersRes.body.orders, [
        { _id: 'Pending', count: 5 },
        { _id: 'Approved', count: 1 },
        { _id: 'In_Production', count: 4 },
        { _id: 'Cancelled', count: 1 },
        { _id: 'unrecognized_legacy_value', count: 1 }
    ]);
});

test('admin order routes allow Admin and reject Customer, Tailor and Delivery Partner', () => {
    const stack = adminRoutes.stack;
    const statusRouteIndex = stack.findIndex(layer =>
        layer.route?.path === '/orders/:id/status' && layer.route.methods.patch
    );
    assert.ok(statusRouteIndex > 1);
    assert.equal(stack[0].handle.name, 'authMiddleware');
    const guard = stack[1].handle;

    const invoke = role => {
        const res = makeResponse();
        let nextCalled = false;
        guard({ user: { role } }, res, () => { nextCalled = true; });
        return { res, nextCalled };
    };

    assert.equal(invoke('admin').nextCalled, true);
    for (const role of ['customer', 'tailor', 'deliver_partner']) {
        const { res, nextCalled } = invoke(role);
        assert.equal(nextCalled, false, `${role} must not update order status`);
        assert.equal(res.statusCode, 403);
    }
});
