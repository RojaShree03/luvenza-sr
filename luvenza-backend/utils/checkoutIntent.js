const normalizeId = value => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'string') {
        return value.length > 0 ? value.toLowerCase() : null;
    }
    if (typeof value.toHexString === 'function') {
        const hex = value.toHexString();
        return typeof hex === 'string' && hex.length > 0 ? hex.toLowerCase() : null;
    }
    return null;
};

const sameNumber = (actual, expected, { integer = false } = {}) =>
    typeof actual === 'number'
    && Number.isFinite(actual)
    && (!integer || Number.isInteger(actual))
    && typeof expected === 'number'
    && Number.isFinite(expected)
    && (!integer || Number.isInteger(expected))
    && actual === expected;

const sameItem = (orderItem, committedItem) => {
    if (!orderItem || !committedItem) return false;
    const orderProductId = normalizeId(orderItem.productId?._id || orderItem.productId);
    const committedProductId = normalizeId(
        committedItem.productId?._id || committedItem.productId
    );

    return orderProductId !== null
        && orderProductId === committedProductId
        && typeof orderItem.productName === 'string'
        && typeof committedItem.productName === 'string'
        && orderItem.productName === committedItem.productName
        && sameNumber(orderItem.quantity, committedItem.quantity, { integer: true })
        && orderItem.quantity > 0
        && typeof orderItem.selectedSize === 'string'
        && typeof committedItem.selectedSize === 'string'
        && orderItem.selectedSize === committedItem.selectedSize
        && sameNumber(orderItem.unitPrice, committedItem.unitPrice)
        && orderItem.unitPrice >= 0
        && sameNumber(orderItem.itemTotal, committedItem.itemTotal)
        && orderItem.itemTotal >= 0;
};

const matchesCommittedOrderIntent = (order, customerId, checkout) => {
    if (!order || !checkout || !Array.isArray(checkout.committedItems)
        || checkout.committedItems.length === 0 || !Array.isArray(order.items)
        || order.items.length !== checkout.committedItems.length
        || typeof checkout.key !== 'string' || checkout.key.length === 0) {
        return false;
    }

    const orderId = normalizeId(order._id);
    const committedOrderId = normalizeId(checkout.committedOrderId);
    const orderCustomerId = normalizeId(order.customerId?._id || order.customerId);
    const expectedCustomerId = normalizeId(customerId);

    if (!orderId || !committedOrderId || orderId !== committedOrderId
        || !orderCustomerId || orderCustomerId !== expectedCustomerId
        || order.checkoutKey !== checkout.key
        || !sameNumber(order.totalAmount, checkout.committedTotalAmount)
        || order.totalAmount < 0) {
        return false;
    }

    return order.items.every((item, index) =>
        sameItem(item, checkout.committedItems[index])
    );
};

module.exports = { matchesCommittedOrderIntent };
