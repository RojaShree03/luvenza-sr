const assert = require('node:assert/strict');
const test = require('node:test');
const User = require('../models/user');
const profileController = require('../controllers/userController');

const baseUser = {
    name: 'Asha Rojas',
    email: 'asha@example.com',
    phone: '9876543210',
    password: 'hashed-password-value'
};

function makeResponse() {
    return {
        statusCode: 200,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; }
    };
}

function makeUser(overrides = {}) {
    return {
        _id: 'user-1',
        role: 'customer',
        password: 'existing-hash',
        profileCompleted: false,
        personalDetails: { toObject: () => ({ preferredName: 'Asha' }) },
        address: { toObject: () => ({ city: 'Pune' }) },
        saveCalls: 0,
        async save() { this.saveCalls += 1; },
        ...overrides
    };
}

function stubFindById(t, user) {
    const original = User.findById;
    const query = {
        select(selection) {
            query.selection = selection;
            return Promise.resolve(user);
        },
        then(resolve, reject) {
            return Promise.resolve(user).then(resolve, reject);
        }
    };
    User.findById = () => query;
    t.after(() => { User.findById = original; });
    return query;
}

test('User schema declares canonical name and persists compatible profile objects', async () => {
    const user = new User({
        ...baseUser,
        personalDetails: { preferredName: 'Asha', gender: 'Prefer not to say' },
        address: { city: 'Pune', legacyAddressField: 'retained' }
    });
    await user.validate();
    assert.equal(user.name, 'Asha Rojas');
    assert.equal(user.personalDetails.preferredName, 'Asha');
    assert.equal(user.address.legacyAddressField, 'retained');
    assert.ok(User.schema.path('personalDetails'));
    assert.ok(User.schema.path('address'));
});

test('User schema validates name and defined address fields', async () => {
    await assert.rejects(new User({ ...baseUser, name: '   ' }).validate(), /Name is required|Name cannot be empty/);
    await assert.rejects(new User({
        ...baseUser,
        address: { addressLine1: 'x'.repeat(201) }
    }).validate(), /addressLine1/);
});

test('profile creation keeps the current payload and cannot change role or password', async t => {
    const user = makeUser();
    stubFindById(t, user);
    const res = makeResponse();
    await profileController.createProfile({
        user: { _id: user._id },
        body: {
            personalDetails: { preferredName: 'Asha' },
            address: { city: 'Pune' },
            role: 'admin',
            password: 'attacker-controlled'
        }
    }, res);

    assert.equal(res.statusCode, 201);
    assert.equal(user.personalDetails.preferredName, 'Asha');
    assert.equal(user.address.city, 'Pune');
    assert.equal(user.role, 'customer');
    assert.equal(user.password, 'existing-hash');
    assert.equal(user.profileCompleted, true);
    assert.equal(user.saveCalls, 1);
});

test('profile update merges nested data and rejects root role/password changes', async t => {
    const user = makeUser();
    stubFindById(t, user);
    const res = makeResponse();
    await profileController.updateProfile({
        user: { _id: user._id },
        body: {
            personalDetails: { preferredName: 'Ash' },
            address: { state: 'Maharashtra' }
        }
    }, res);

    assert.equal(res.statusCode, 200);
    assert.deepEqual(user.personalDetails, { preferredName: 'Ash' });
    assert.deepEqual(user.address, { city: 'Pune', state: 'Maharashtra' });

    const savesBeforeReject = user.saveCalls;
    const rejected = makeResponse();
    await profileController.updateProfile({
        user: { _id: user._id },
        body: { role: 'admin', password: 'new-password' }
    }, rejected);
    assert.equal(rejected.statusCode, 400);
    assert.equal(user.role, 'customer');
    assert.equal(user.password, 'existing-hash');
    assert.equal(user.saveCalls, savesBeforeReject);
});

test('profile retrieval excludes password and reset-token fields', async t => {
    const user = makeUser();
    const query = stubFindById(t, user);
    const res = makeResponse();
    await profileController.getProfile({ user: { _id: user._id } }, res);

    assert.equal(res.statusCode, 200);
    assert.match(query.selection, /-password/);
    assert.match(query.selection, /-resetPasswordOTP/);
    assert.equal(res.body.profile, user);
});

test('profile endpoints reject non-object nested data', async t => {
    const user = makeUser();
    stubFindById(t, user);
    const res = makeResponse();
    await profileController.updateProfile({
        user: { _id: user._id },
        body: { address: ['invalid'] }
    }, res);
    assert.equal(res.statusCode, 400);
    assert.equal(user.saveCalls, 0);
});
