const mongoose = require('mongoose');
const Order = require('../models/order');
const { verifyCheckoutIndex } = require('./checkoutIndexReadiness');
const { recoverCheckoutClaimsAtStartup } = require('../controllers/orderController');

const connectDB = async()=>{
    try{
        const connection = await mongoose.connect(
            process.env.MONGODB_URI
        );
        await verifyCheckoutIndex(Order.collection);
        await recoverCheckoutClaimsAtStartup();
        console.log(`MONGODB_CONNECTED: ${connection.connection.host}`);

    } catch(error){
        console.log(`MONGODB_CONNECTION_FAILED`,error.message);
        process.exit(1);
    }
}
module.exports= connectDB;
