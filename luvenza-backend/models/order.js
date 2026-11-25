
const mongoose = require('mongoose');
const { ORDER_STATUSES } = require('../utils/orderStatus');

const orderItemSchema = new mongoose.Schema({
    productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: true
    },

    productName: {
        type: String,
        required: true
    },

    quantity: {
        type: Number,
        required: true,
        min: 1
    },

    selectedSize: {
        type: String,
        required: true
    },

    unitPrice: {
        type: Number,
        required: true,
        min: 0
    },

    itemTotal: {
        type: Number,
        required: true,
        min: 0
    }
}, { _id: false });

const orderSchema = new mongoose.Schema({

    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    items: {
        type: [orderItemSchema],
        required: true,
        validate: {
            validator: items => items.length > 0,
            message: 'An order must contain at least one item'
        }
    },

    customizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customization'
    },

    assignedTailor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },

    assignedDeliveryPartner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },

    totalAmount: {
        type: Number,
        required: true,
        min: 0
    },

    status: {
        type: String,
        enum: ORDER_STATUSES,
        default: 'Pending'
    }

}, { timestamps: true });

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
