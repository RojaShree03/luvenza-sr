const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const {
    analyzeSource,
    analyzeTree,
    collectProductionFiles
} = require('./helpers/paymentBoundaryAnalyzer');

const root = path.resolve(__dirname, '..');
const files = collectProductionFiles(root);

test('production tree has no payment writes outside approved repository boundaries', () => {
    assert.deepEqual(analyzeTree(root), []);
});

test('analyzer scans JavaScript module extensions across the production tree', () => {
    assert.ok(files.some(file => file.endsWith('.js')));
    assert.ok(files.every(file => /\.(js|cjs|mjs)$/.test(file)));
    assert.equal(files.some(file => /node_modules|\\tests\\|\\docs\\/.test(file)), false);
});

test('architecture analyzer catches direct imports, aliases, barrels and model registry access', () => {
    const cases = [
        ['controllers/pay.js', "const P = require('../models/payment');"],
        ['controllers/pay.js', "const P = require('models/payment');"],
        ['controllers/pay.js', "const P = require('@models/payment');"],
        ['routes/pay.mjs', "import Whatever from '../models/paymentWebhookEvent.js';"],
        ['repositories/index.js', "export { default as P } from '../models/payment.js';"],
        ['services/pay.cjs', "const model = mongoose.model('Payment');"],
        ['services/pay.js', "const getModel = mongoose.model; getModel('Payment');"],
        ['services/pay.js', "mongoose['model']('Payment');"]
    ];
    for (const [file, source] of cases) assert.ok(analyzeSource({ file, source }).length, file);
});

test('architecture analyzer catches native writes and middleware bypass options', () => {
    for (const source of [
        "const Event = require('mongoose').model('PaymentWebhookEvent');",
        "db.collection('payments').updateOne(filter, update);",
        "db.collection('paymentwebhookevents').deleteMany({});",
        "const collection = db.collection('payments'); collection.updateOne(filter, update);",
        "db.command({ update: 'payments', updates: [] });",
        "query.setOptions({ middleware: false });",
        "Payment.updateOne(filter, update, { middleware: { pre: false } });",
        "query.setOptions({ ['middleware']: false });"
    ]) assert.ok(analyzeSource({ file: 'services/write.js', source }).length, source);
});

test('startup modules reject direct and native payment writes while readiness exposes only a check', () => {
    for (const source of [
        "Payment.updateOne({}, {});",
        "const collection = db.collection('payments'); collection.updateOne({}, {});",
        "db.collection('paymentwebhookevents').deleteMany({});",
        "db.collection('payments').createIndex({});"
    ]) {
        assert.ok(analyzeSource({ file: 'config/db.js', source }).length, source);
    }
    assert.ok(analyzeSource({
        file: 'server.js',
        source: "const collection = db.collection('payments'); collection.deleteMany({});"
    }).length);
    const readiness = require('../repositories/paymentIndexReadinessRepository');
    assert.deepEqual(Object.keys(readiness), ['verifyPaymentIndexReadiness']);
    assert.ok(analyzeSource({
        file: 'repositories/paymentIndexReadinessRepository.js',
        source: "Payment.updateOne({}, {});"
    }).length);
    assert.ok(analyzeSource({
        file: 'repositories/paymentIndexReadinessRepository.js',
        source: 'Payment.collection.createIndex({});'
    }).length);
});

test('architecture analyzer protects test seams and webhook completion workflow', () => {
    assert.ok(analyzeSource({ file: 'services/payment.js', source: 'repo.__testOnly.createPaymentRepository();' }).length);
    assert.ok(analyzeSource({ file: 'repositories/paymentIndexReadinessRepository.js', source: 'repo.__testOnly.createPaymentRepository();' }).length);
    assert.ok(analyzeSource({ file: 'controllers/webhook.js', source: 'completeClaimedWebhookEvent(args);' }).length);
    assert.ok(analyzeSource({ file: 'controllers/webhook.js', source: "require('../repositories/paymentWebhookEventCompletion');" }).length);
    assert.ok(analyzeSource({ file: 'controllers/webhook.js', source: "const finish = require('../repositories/paymentWebhookEventCompletion').completeClaimedWebhookEvent; finish();" }).length);
});

test('repository source cannot expose generic mutations or deletion paths', () => {
    for (const method of ['updateMany', 'replaceOne', 'findOneAndReplace', 'bulkWrite', 'deleteOne', 'deleteMany', 'createIndex']) {
        assert.ok(analyzeSource({
            file: 'repositories/paymentRepository.js',
            source: `Payment.${method}({});`
        }).some(message => /write|operation/.test(message)), method);
        assert.ok(analyzeSource({
            file: 'repositories/paymentRepository.js',
            source: `PaymentModel['${method}']({});`
        }).some(message => /write|operation/.test(message)), method);
    }
    assert.ok(analyzeSource({
        file: 'repositories/paymentRepository.js',
        source: 'Payment.collection.updateOne({}, {});'
    }).length);
});

test('public webhook repository does not export a direct completion operation', () => {
    const eventRepo = require('../repositories/paymentWebhookEventRepository');
    const processor = require('../utils/paymentWebhookProcessing');
    assert.equal(Object.hasOwn(eventRepo, 'completeWebhookEvent'), false);
    assert.equal(Object.hasOwn(eventRepo, 'completeClaimedWebhookEvent'), false);
    assert.equal(Object.hasOwn(processor, 'completeClaimedWebhookEvent'), false);
    assert.deepEqual(Object.keys(eventRepo).filter(key => key !== '__testOnly').sort(), [
        'DEFAULT_WEBHOOK_LEASE_MS', 'claimWebhookEvent', 'createVerifiedWebhookEvent',
        'failWebhookEvent', 'retryWebhookEvent', 'sanitizeError'
    ]);
});
