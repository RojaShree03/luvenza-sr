const ORDER_STATUSES = Object.freeze([
    'Pending',
    'Awaiting_Approval',
    'Approved',
    'Awaiting_Payment',
    'Paid',
    'In_Production',
    'Quality_Check',
    'Ready_For_Dispatch',
    'Shipped',
    'Out_For_Delivery',
    'Delivered',
    'Cancelled'
]);

const LEGACY_STATUS_ALIASES = Object.freeze({
    placed: 'Pending',
    confirmed: 'Approved',
    tailoring: 'In_Production',
    ready_for_delivery: 'Ready_For_Dispatch',
    out_for_delivery: 'Out_For_Delivery',
    delivered: 'Delivered',
    cancelled: 'Cancelled'
});

const canonicalByLowercase = new Map(
    ORDER_STATUSES.map(status => [status.toLowerCase(), status])
);

const aliasesByCanonical = Object.entries(LEGACY_STATUS_ALIASES)
    .reduce((aliases, [legacyStatus, canonicalStatus]) => {
        aliases[canonicalStatus] ||= [];
        aliases[canonicalStatus].push(legacyStatus);
        return aliases;
    }, {});

const ADMIN_TRANSITIONS = Object.freeze({
    Pending: ['Awaiting_Approval', 'Approved', 'In_Production', 'Cancelled'],
    Awaiting_Approval: ['Approved', 'Cancelled'],
    Approved: ['Awaiting_Payment', 'In_Production', 'Cancelled'],
    Awaiting_Payment: ['Cancelled'],
    Paid: ['In_Production', 'Cancelled'],
    In_Production: ['Quality_Check', 'Cancelled'],
    Quality_Check: ['In_Production', 'Ready_For_Dispatch', 'Cancelled'],
    Ready_For_Dispatch: ['Shipped', 'Out_For_Delivery', 'Cancelled'],
    Shipped: ['Out_For_Delivery', 'Cancelled'],
    Out_For_Delivery: ['Delivered', 'Cancelled'],
    Delivered: [],
    Cancelled: []
});

const CUSTOMER_CANCELLABLE_STATUSES = Object.freeze([
    'Pending',
    'Awaiting_Approval'
]);

function normalizeOrderStatus(value) {
    if (typeof value !== 'string') return null;
    const normalizedKey = value.trim().toLowerCase();
    return LEGACY_STATUS_ALIASES[normalizedKey]
        || canonicalByLowercase.get(normalizedKey)
        || null;
}

function storedStatusValues(status) {
    const canonicalStatus = normalizeOrderStatus(status);
    if (!canonicalStatus) return [];
    return [canonicalStatus, ...(aliasesByCanonical[canonicalStatus] || [])];
}

function canTransitionOrderStatus(currentValue, nextValue, actorRole = 'admin') {
    const currentStatus = normalizeOrderStatus(currentValue);
    const nextStatus = normalizeOrderStatus(nextValue);

    if (!currentStatus || !nextStatus) return false;
    if (currentStatus === nextStatus) return true;

    // A verified payment service, not an admin status edit, must authorize this transition.
    if (nextStatus === 'Paid') {
        return actorRole === 'payment' && currentStatus === 'Awaiting_Payment';
    }

    if (nextStatus === 'Cancelled') {
        if (actorRole === 'customer') {
            return CUSTOMER_CANCELLABLE_STATUSES.includes(currentStatus);
        }
        if (actorRole === 'admin') {
            return currentStatus !== 'Delivered' && currentStatus !== 'Cancelled';
        }
        return false;
    }

    if (actorRole !== 'admin') return false;
    return ADMIN_TRANSITIONS[currentStatus].includes(nextStatus);
}

module.exports = {
    ORDER_STATUSES,
    LEGACY_STATUS_ALIASES,
    ADMIN_TRANSITIONS,
    CUSTOMER_CANCELLABLE_STATUSES,
    normalizeOrderStatus,
    storedStatusValues,
    canTransitionOrderStatus
};
