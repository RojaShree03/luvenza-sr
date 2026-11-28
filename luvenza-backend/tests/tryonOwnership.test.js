const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const Customization = require('../models/customization');
const TryOn = require('../models/tryOn');
const tryonController = require('../controllers/tryonController');
const uploadFs = require('node:fs/promises');

const ownerId = '64b000000000000000000001';
const otherUserId = '64b000000000000000000002';
const customizationId = '64b000000000000000000003';

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

function installNoopUploadCleanup(t) {
    const original = uploadFs.unlink;
    uploadFs.unlink = async () => {};
    t.after(() => { uploadFs.unlink = original; });
}

function makeRequest(userId = ownerId) {
    return {
        user: { _id: userId },
        body: {
            customizationId,
            designConfiguration: { fabric: 'silk', color: 'plum' }
        },
        params: { customizationId },
        file: { path: 'test-upload.jpg', filename: 'test-upload.jpg' }
    };
}

test('owner can generate a try-on for their own customization', async t => {
    let customizationFilter;
    let tryOnUpdates = 0;
    stubMethod(t, Customization, 'findOne', async filter => {
        customizationFilter = filter;
        return { isPreviewEligible: true };
    });
    stubMethod(t, TryOn, 'findOneAndUpdate', async (filter, update, options) => {
        tryOnUpdates += 1;
        if (tryOnUpdates === 1) {
            assert.deepEqual(filter, { customerId: ownerId, customizationId });
            assert.equal(options.upsert, true);
            return { customerId: ownerId, customizationId };
        }
        assert.deepEqual(filter, {
            customerId: ownerId,
            customizationId,
            generationCount: { $lt: 3 }
        });
        assert.ok(update.$push.generatedPreviews);
        return {
            generationCount: 1,
            generatedPreviews: [{
                designConfiguration: { fabric: 'silk', color: 'plum' },
                previewImage: 'uploads/tryon/test-upload.jpg'
            }]
        };
    });

    const res = makeResponse();
    await tryonController.generateTryOn(makeRequest(), res);

    assert.deepEqual(customizationFilter, { _id: customizationId, userId: ownerId });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.data.remainingGenerations, 2);
});

test('another user cannot generate a try-on for a customization they do not own', async t => {
    installNoopUploadCleanup(t);
    let tryOnQueried = false;
    let customizationFilter;
    stubMethod(t, Customization, 'findOne', async filter => {
        customizationFilter = filter;
        return null;
    });
    stubMethod(t, TryOn, 'findOneAndUpdate', async () => {
        tryOnQueried = true;
        throw new Error('TryOn should not be queried for an unowned customization');
    });

    const res = makeResponse();
    await tryonController.generateTryOn(makeRequest(otherUserId), res);

    assert.deepEqual(customizationFilter, { _id: customizationId, userId: otherUserId });
    assert.equal(tryOnQueried, false);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { success: false, message: 'Customization not found' });
});

test('owner can retrieve their own try-on history', async t => {
    let customizationFilter;
    let tryOnFilter;
    stubMethod(t, Customization, 'findOne', async filter => {
        customizationFilter = filter;
        return { _id: customizationId, userId: ownerId };
    });
    stubMethod(t, TryOn, 'findOne', async filter => {
        tryOnFilter = filter;
        return {
            generationCount: 2,
            maxGenerations: 3,
            generatedPreviews: [{ id: 'old' }, { id: 'new' }]
        };
    });

    const res = makeResponse();
    await tryonController.getTryOnHistory(makeRequest(), res);

    assert.deepEqual(customizationFilter, { _id: customizationId, userId: ownerId });
    assert.deepEqual(tryOnFilter, { customerId: ownerId, customizationId });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.data.previews, [{ id: 'new' }, { id: 'old' }]);
});

test('another user cannot retrieve try-on history for an unowned customization', async t => {
    let historyQueried = false;
    stubMethod(t, Customization, 'findOne', async () => null);
    stubMethod(t, TryOn, 'findOne', async () => {
        historyQueried = true;
        return { generatedPreviews: [{ privatePreview: true }] };
    });

    const res = makeResponse();
    await tryonController.getTryOnHistory(makeRequest(otherUserId), res);

    assert.equal(historyQueried, false);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { success: false, message: 'Customization not found' });
});

test('owner can read remaining try-on generations', async t => {
    let tryOnFilter;
    stubMethod(t, Customization, 'findOne', async () => ({ _id: customizationId, userId: ownerId }));
    stubMethod(t, TryOn, 'findOne', async filter => {
        tryOnFilter = filter;
        return { generationCount: 1, maxGenerations: 3 };
    });

    const res = makeResponse();
    await tryonController.getRemainingGenerations(makeRequest(), res);

    assert.deepEqual(tryOnFilter, { customerId: ownerId, customizationId });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.remainingGenerations, 2);
    assert.equal(res.body.data.canGenerate, true);
});

test('another user cannot read remaining generations for an unowned customization', async t => {
    let remainingQueried = false;
    stubMethod(t, Customization, 'findOne', async () => null);
    stubMethod(t, TryOn, 'findOne', async () => {
        remainingQueried = true;
        return { generationCount: 1, maxGenerations: 3 };
    });

    const res = makeResponse();
    await tryonController.getRemainingGenerations(makeRequest(otherUserId), res);

    assert.equal(remainingQueried, false);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { success: false, message: 'Customization not found' });
});

test('try-on controller imports the exact customization model filename', () => {
    const modelPath = path.resolve(__dirname, '../models/customization.js');
    const controllerPath = path.resolve(__dirname, '../controllers/tryonController.js');
    const controllerSource = fs.readFileSync(controllerPath, 'utf8');

    assert.equal(fs.existsSync(modelPath), true);
    assert.match(controllerSource, /require\(['"]\.\.\/models\/customization['"]\)/);
    assert.equal(require('../models/customization').modelName, 'Customization');
});
