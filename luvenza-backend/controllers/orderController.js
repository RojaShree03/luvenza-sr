const Cart = require('../models/cart');
const Order = require('../models/order');
const Product = require('../models/product');
const mongoose = require('mongoose');
const { createHash, randomUUID } = require('node:crypto');
const {
    normalizeOrderStatus,
    storedStatusValues
} = require('../utils/orderStatus');
const { matchesCommittedOrderIntent } = require('../utils/checkoutIntent');

const CHECKOUT_LEASE_MS = 2 * 60 * 1000;

const normalizeOrderForResponse = order => {
    if (order && normalizeOrderStatus(order.status)) {
        order.status = normalizeOrderStatus(order.status);
    }
    return order;
};

const scopedCheckoutKey = (customerId, key) => createHash('sha256')
    .update(`${customerId}:${key}`)
    .digest('hex');

const respondWithOrder = (res, order, statusCode = 201) => {
    normalizeOrderForResponse(order);
    if (typeof order?.set === 'function') order.set('checkoutKey', undefined);
    else if (order) delete order.checkoutKey;
    return res.status(statusCode).json({
        success: true,
        message: 'Order placed successfully',
        order
    });
};

const clearLegacyClaimedCart = (userId, checkoutKey, processingToken) => Cart.findOneAndUpdate({
    userId,
    'checkout.key': checkoutKey,
    'checkout.state': 'processing',
    'checkout.processingToken': processingToken,
    'checkout.leaseExpiresAt': { $gt: new Date() }
}, {
    $set: { items: [] },
    $unset: { checkout: 1 },
    $inc: { __v: 1 }
}, { new: true });

const releaseClaimedCart = (userId, checkoutKey, processingToken) => Cart.findOneAndUpdate({
    userId,
    'checkout.key': checkoutKey,
    'checkout.state': 'processing',
    'checkout.processingToken': processingToken
}, {
    $unset: { checkout: 1 },
    $inc: { __v: 1 }
}, { new: true });

const acquireExpiredCheckout = (userId, checkoutKey, processingToken, now = new Date()) => (
    Cart.findOneAndUpdate({
        userId,
        'checkout.key': checkoutKey,
        $and: [
            {
                $or: [
                    { 'checkout.state': 'processing' },
                    { 'checkout.state': { $exists: false } }
                ]
            },
            {
                $or: [
                    { 'checkout.leaseExpiresAt': { $lte: now } },
                    { 'checkout.leaseExpiresAt': { $exists: false } }
                ]
            }
        ]
    }, {
        $set: {
            'checkout.state': 'processing',
            'checkout.processingToken': processingToken,
            'checkout.leaseExpiresAt': new Date(now.getTime() + CHECKOUT_LEASE_MS)
        },
        $inc: { __v: 1 }
    }, { new: true, runValidators: true }).select('+checkout')
);

const commitCheckoutIntent = (userId, checkoutKey, processingToken, orderId, orderItems, totalAmount, now = new Date()) => (
    Cart.findOneAndUpdate({
        userId,
        'checkout.key': checkoutKey,
        'checkout.state': 'processing',
        'checkout.processingToken': processingToken,
        'checkout.leaseExpiresAt': { $gt: now }
    }, {
        $set: {
            'checkout.state': 'committed',
            'checkout.committedOrderId': orderId,
            'checkout.committedItems': orderItems,
            'checkout.committedTotalAmount': totalAmount
        }
    }, { new: true, runValidators: true }).select('+checkout')
);

const clearCommittedCart = (userId, checkout) => Cart.findOneAndUpdate({
    userId,
    'checkout.key': checkout.key,
    'checkout.state': 'committed',
    'checkout.processingToken': checkout.processingToken,
    'checkout.committedOrderId': checkout.committedOrderId
}, {
    $set: { items: [] },
    $unset: { checkout: 1 },
    $inc: { __v: 1 }
}, { new: true });

const assertCommittedOrderMatches = (order, userId, checkout) => {
    if (!matchesCommittedOrderIntent(order, userId, checkout)) {
        throw new Error('Existing order does not match committed checkout intent');
    }
};

const materializeCommittedOrder = async (userId, checkout) => {
    let order = await Order.findOne({ customerId: userId, checkoutKey: checkout.key })
        .select('+checkoutKey');
    if (order) {
        assertCommittedOrderMatches(order, userId, checkout);
        return { order, created: false };
    }

    try {
        order = await Order.create({
            _id: checkout.committedOrderId,
            customerId: userId,
            checkoutKey: checkout.key,
            items: checkout.committedItems,
            totalAmount: checkout.committedTotalAmount,
            status: 'Pending'
        });
        return { order, created: true };
    } catch (error) {
        if (error.code !== 11000) throw error;
        order = await Order.findOne({ customerId: userId, checkoutKey: checkout.key })
            .select('+checkoutKey');
        if (!matchesCommittedOrderIntent(order, userId, checkout)) {
            throw new Error('Existing order does not match committed checkout intent');
        }
        return { order, created: false };
    }
};

const finishCommittedCheckout = async (userId, checkout) => {
    const materialized = await materializeCommittedOrder(userId, checkout);
    const cleared = await clearCommittedCart(userId, checkout);
    if (!cleared) {
        const stillClaimed = await Cart.findOne({
            userId,
            'checkout.key': checkout.key,
            'checkout.state': 'committed',
            'checkout.committedOrderId': checkout.committedOrderId
        }).select('+checkout');
        if (stillClaimed) {
            throw new Error('Committed order exists but cart clearing is pending');
        }
    }
    return materialized;
};

const recoverExpiredCheckoutForUser = async userId => {
    const cart = await Cart.findOne({ userId }).select('+checkout');
    if (!cart?.checkout?.key) return false;

    if (cart.checkout.state === 'committed') {
        await finishCommittedCheckout(userId, cart.checkout);
        return true;
    }

    const processingToken = randomUUID();
    const claim = await acquireExpiredCheckout(
        userId, cart.checkout.key, processingToken
    );
    if (!claim) return false;

    const existingOrder = await Order.findOne({
        customerId: userId,
        checkoutKey: claim.checkout.key
    });
    if (existingOrder) {
        const cleared = await clearLegacyClaimedCart(
            userId, claim.checkout.key, processingToken
        );
        return Boolean(cleared);
    }

    const released = await releaseClaimedCart(
        userId, claim.checkout.key, processingToken
    );
    return Boolean(released);
};

const recoverCheckoutClaimsAtStartup = async () => {
    const carts = await Cart.find({ 'checkout.key': { $exists: true } })
        .select('+checkout');

    for (const cart of carts) {
        if (cart.checkout?.state === 'committed') {
            await finishCommittedCheckout(cart.userId, cart.checkout);
            continue;
        }

        const processingToken = randomUUID();
        const claim = await acquireExpiredCheckout(
            cart.userId, cart.checkout.key, processingToken
        );
        if (!claim) continue;

        const existingOrder = await Order.findOne({
            customerId: claim.userId,
            checkoutKey: claim.checkout.key
        });
        if (existingOrder) {
            const cleared = await clearLegacyClaimedCart(
                claim.userId, claim.checkout.key, processingToken
            );
            if (!cleared) throw new Error('Legacy checkout cart recovery is pending');
        } else {
            await releaseClaimedCart(
                claim.userId, claim.checkout.key, processingToken
            );
        }
    }
};

// Product prices are Numbers expressed in major currency units (the existing
// API/storage contract). Convert their decimal representation to integer
// minor units before multiplication and summation.
const toMinorUnits = amount => {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) {
        return null;
    }

    const match = amount.toString().toLowerCase()
        .match(/^(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/);
    if (!match) return null;

    const integerDigits = match[1];
    const fractionDigits = match[2] || '';
    const exponent = Number(match[3] || 0);
    const digits = BigInt(`${integerDigits}${fractionDigits}`);
    const scale = fractionDigits.length - exponent;
    let minorUnits;

    if (scale <= 2) {
        minorUnits = digits * (10n ** BigInt(2 - scale));
    } else {
        const divisor = 10n ** BigInt(scale - 2);
        const quotient = digits / divisor;
        const remainder = digits % divisor;
        minorUnits = quotient + (remainder * 2n >= divisor ? 1n : 0n);
    }

    return minorUnits <= BigInt(Number.MAX_SAFE_INTEGER) ? minorUnits : null;
};

const validateCheckoutItems = async items => {
    const orderItems = [];
    let totalAmountMinor = 0n;

    for (const item of items) {
        if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) {
            return { error: 'Cart contains an invalid quantity' };
        }
        if (!mongoose.Types.ObjectId.isValid(item.productId)) {
            return { error: 'One or more products are no longer available' };
        }

        const product = await Product.findById(item.productId);
        if (!product) {
            return { error: 'One or more products are no longer available' };
        }

        if (!Array.isArray(product.availableSizes)
            || !product.availableSizes.includes(item.selectedSize)) {
            return { error: `${product.productName} is not available in size ${item.selectedSize}` };
        }

        const unitPrice = product.pricing?.newPrice;
        const unitPriceMinor = toMinorUnits(unitPrice);
        if (unitPriceMinor === null) {
            return { error: 'Invalid product price' };
        }

        const itemTotalMinor = unitPriceMinor * BigInt(item.quantity);
        if (itemTotalMinor > BigInt(Number.MAX_SAFE_INTEGER)) {
            return { error: 'Invalid order total' };
        }

        const itemTotal = Number(itemTotalMinor) / 100;
        const normalizedUnitPrice = Number(unitPriceMinor) / 100;

        orderItems.push({
            productId: product._id,
            productName: product.productName,
            quantity: item.quantity,
            selectedSize: item.selectedSize,
            unitPrice: normalizedUnitPrice,
            itemTotal
        });
        totalAmountMinor += itemTotalMinor;
    }

    if (totalAmountMinor > BigInt(Number.MAX_SAFE_INTEGER)) {
        return { error: 'Invalid order total' };
    }
    return { orderItems, totalAmount: Number(totalAmountMinor) / 100 };
};

// POST - Place order. A durable cart claim makes retries recoverable without
// requiring MongoDB multi-document transactions.
const placeOrder = async (req, res) => {
    const userId = req.user._id;
    const rawIdempotencyKey = req.get?.('Idempotency-Key')
        || req.headers?.['idempotency-key'];

    if (rawIdempotencyKey !== undefined
        && (typeof rawIdempotencyKey !== 'string'
            || rawIdempotencyKey.trim().length === 0
            || rawIdempotencyKey.length > 200)) {
        return res.status(400).json({
            success: false,
            message: 'Idempotency-Key must be a non-empty string of at most 200 characters'
        });
    }

    const requestedKey = rawIdempotencyKey
        ? scopedCheckoutKey(userId, rawIdempotencyKey)
        : null;

    try {
        const previouslyCreatedOrder = requestedKey
            ? await Order.findOne({ customerId: userId, checkoutKey: requestedKey })
                .select('+checkoutKey')
            : null;
        let cart = await Cart.findOne({ userId }).select('+checkout');

        if (previouslyCreatedOrder) {
            if (cart?.checkout?.key === requestedKey) {
                if (cart.checkout.state === 'committed') {
                    await finishCommittedCheckout(userId, cart.checkout);
                } else {
                    const recoveryToken = randomUUID();
                    const recoveryClaim = await acquireExpiredCheckout(
                        userId, requestedKey, recoveryToken
                    );
                    if (!recoveryClaim) {
                        return res.status(409).json({
                            success: false,
                            message: 'Checkout recovery is already in progress. Please retry.'
                        });
                    }
                    const cleared = await clearLegacyClaimedCart(
                        userId, requestedKey, recoveryToken
                    );
                    if (!cleared) {
                        return res.status(409).json({
                            success: false,
                            message: 'Order exists but cart recovery is pending. Please retry.'
                        });
                    }
                }
            }
            return respondWithOrder(res, previouslyCreatedOrder, 200);
        }

        if (!cart) {
            return res.status(400).json({ success: false, message: 'Your cart is empty' });
        }

        if (cart.checkout?.state === 'committed') {
            if (requestedKey && requestedKey !== cart.checkout.key) {
                return res.status(409).json({
                    success: false,
                    message: 'Another checkout request is already being processed.'
                });
            }
            const recovered = await finishCommittedCheckout(userId, cart.checkout);
            return respondWithOrder(res, recovered.order, recovered.created ? 201 : 200);
        }

        let processingToken = randomUUID();
        if (cart.checkout?.key) {
            if (requestedKey && requestedKey !== cart.checkout.key) {
                return res.status(409).json({
                    success: false,
                    message: 'Another checkout request is already being processed.'
                });
            }
            cart = await acquireExpiredCheckout(
                userId, cart.checkout.key, processingToken
            );
            if (!cart) {
                return res.status(409).json({
                    success: false,
                    message: 'Checkout is already being processed. Please retry.'
                });
            }
        } else {
            if (cart.items.length === 0) {
                return res.status(400).json({ success: false, message: 'Your cart is empty' });
            }

            const checkoutKey = requestedKey || scopedCheckoutKey(userId, randomUUID());
            const snapshot = cart.items.map(item => ({
                productId: item.productId?._id || item.productId,
                quantity: item.quantity,
                selectedSize: item.selectedSize
            }));
            const now = new Date();
            const versionFilter = cart.__v === undefined
                ? { $or: [{ __v: { $exists: false } }, { __v: 0 }] }
                : { __v: cart.__v };
            const claimedCart = await Cart.findOneAndUpdate({
                _id: cart._id,
                userId,
                ...versionFilter,
                checkout: { $exists: false },
                'items.0': { $exists: true }
            }, {
                $set: {
                    checkout: {
                        key: checkoutKey,
                        state: 'processing',
                        processingToken,
                        leaseExpiresAt: new Date(now.getTime() + CHECKOUT_LEASE_MS),
                        items: snapshot
                    }
                },
                $inc: { __v: 1 }
            }, { new: true, runValidators: true }).select('+checkout');

            if (claimedCart) {
                cart = claimedCart;
            } else {
                const currentCart = await Cart.findOne({ userId }).select('+checkout');
                if (!currentCart?.checkout?.key) {
                    return res.status(409).json({
                        success: false,
                        message: 'Cart changed during checkout. Please try again.'
                    });
                }
                if (requestedKey && requestedKey !== currentCart.checkout.key) {
                    return res.status(409).json({
                        success: false,
                        message: 'Another checkout request is already being processed.'
                    });
                }
                cart = await acquireExpiredCheckout(
                    userId, currentCart.checkout.key, processingToken
                );
                if (!cart) {
                    return res.status(409).json({
                        success: false,
                        message: 'Checkout is already being processed. Please retry.'
                    });
                }
            }
        }

        const checkoutKey = cart.checkout.key;
        if (requestedKey && requestedKey !== checkoutKey) {
            return res.status(409).json({
                success: false,
                message: 'Another checkout request is already being processed.'
            });
        }

        const existingOrder = await Order.findOne({ customerId: userId, checkoutKey })
            .select('+checkoutKey');
        if (existingOrder) {
            const cleared = await clearLegacyClaimedCart(userId, checkoutKey, processingToken);
            if (!cleared) {
                return res.status(409).json({
                    success: false,
                    message: 'Order exists but cart recovery is pending. Please retry.'
                });
            }
            return respondWithOrder(res, existingOrder, 200);
        }

        const validation = await validateCheckoutItems(cart.checkout.items);
        if (validation.error) {
            const released = await releaseClaimedCart(
                userId, checkoutKey, processingToken
            );
            if (!released) {
                return res.status(409).json({
                    success: false,
                    message: 'Checkout ownership changed. Please retry.'
                });
            }
            return res.status(400).json({ success: false, message: validation.error });
        }

        const committedOrderId = new mongoose.Types.ObjectId();
        const committedCart = await commitCheckoutIntent(
            userId,
            checkoutKey,
            processingToken,
            committedOrderId,
            validation.orderItems,
            validation.totalAmount
        );
        if (!committedCart) {
            return res.status(409).json({
                success: false,
                message: 'Checkout ownership expired. Please retry.'
            });
        }
        const finalized = await finishCommittedCheckout(userId, committedCart.checkout);
        return respondWithOrder(res, finalized.order, finalized.created ? 201 : 200);

    } catch (error) {
        // Keep the cart claim after an uncertain persistence failure. A retry
        // checks the idempotency record and finishes cart clearing safely.
        console.error('Checkout failed:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Unable to place order. Please retry checkout.'
        });
    }
};


// GET - Customer order history
const getMyOrders = async (req, res) => {
    try {
        const orders = await Order.find({
            customerId: req.user._id
        }).sort({ createdAt: -1 });

        orders.forEach(normalizeOrderForResponse);

        res.status(200).json({
            success: true,
            count: orders.length,
            orders
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


const getOrderById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid order ID'
            });
        }

        const order = await Order.findOne({
            _id: id,
            customerId: req.user._id
        });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        normalizeOrderForResponse(order);
        res.status(200).json({
            success: true,
            order
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

// cancel order
const cancelOrder = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid order ID'
            });
        }

        const eligibleStatuses = [
            ...storedStatusValues('Pending'),
            ...storedStatusValues('Awaiting_Approval')
        ];
        const order = await Order.findOneAndUpdate({
            _id: id,
            customerId: req.user._id,
            status: { $in: eligibleStatuses }
        }, {
            $set: { status: 'Cancelled' }
        }, {
            new: true,
            runValidators: true
        });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found or cannot be cancelled'
            });
        }

        normalizeOrderForResponse(order);

        res.status(200).json({
            success: true,
            message: 'Order cancelled successfully',
            order
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

module.exports = {
    placeOrder,
    getMyOrders,
    getOrderById, 
    cancelOrder,
    recoverExpiredCheckoutForUser,
    recoverCheckoutClaimsAtStartup
};
