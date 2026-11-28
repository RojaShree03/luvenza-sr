const EXPECTED_INDEX_KEY = [
    ['customerId', 1],
    ['checkoutKey', 1]
];

const isCheckoutIndexReady = indexes => indexes.some(index => {
    const key = Object.entries(index.key || {});
    const partial = index.partialFilterExpression || {};
    const partialCheckoutKey = partial.checkoutKey || {};
    const partialType = partialCheckoutKey.$type;
    return index.unique === true
        && key.length === EXPECTED_INDEX_KEY.length
        && key.every(([field, direction], position) =>
            field === EXPECTED_INDEX_KEY[position][0]
            && direction === EXPECTED_INDEX_KEY[position][1]
        )
        && Object.keys(partial).length === 1
        && Object.keys(partialCheckoutKey).length === 1
        && (partialType === 'string' || partialType === 2);
});

const verifyCheckoutIndex = async collection => {
    const indexes = await collection.listIndexes().toArray();
    if (!isCheckoutIndexReady(indexes)) {
        throw new Error(
            'Checkout is disabled: required unique index on '
            + '(customerId, checkoutKey) with a string checkoutKey filter is missing.'
        );
    }
    return true;
};

module.exports = { isCheckoutIndexReady, verifyCheckoutIndex };
