const mongoose = require('mongoose');

const connectDB = async()=>{
    try{
        const connection = await mongoose.connect(
            process.env.MONGODB_URI
        );
        console.log(`MONGODB_CONNECTED: ${connection.connection.host}`);

    } catch(error){
        console.log(`MONGODB_CONNECTION_FAILED`,error.message);
        process.exit(1);
    }
}
module.exports= connectDB;