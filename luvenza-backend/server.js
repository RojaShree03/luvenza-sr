const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const userRoutes = require('./routes/userRoutes');
const wishlistRoutes = require('./routes/wishlistRoutes');
const cartRoutes = require('./routes/cartRoutes');
const measurementRoutes = require('./routes/measurementRoutes');
const customizationRoutes = require('./routes/customizationRoutes');
const orderRoutes = require('./routes/orderRoutes');

const adminCustomerRoutes = require("./routes/adminCustomerRoutes");
const collectionRoutes = require("./routes/collectionRoutes");
const designComponentRoutes = require("./routes/designComponentRoutes");
const templateRoutes = require("./routes/templateRoutes");
const designerRequestRoutes = require("./routes/designerRequestRoutes");
const adminRoutes = require("./routes/adminRoutes");

dotenv.config();

const app = express();

const PORT = process.env.PORT || 5000

app.use(cors({
    origin: "http://localhost:5173",
    credentials: true
}));

app.use(express.json());
app.use(helmet());
app.use(morgan("dev"));
app.use(cookieParser());

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/users', userRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/measurements', measurementRoutes);
app.use('/api/customizations', customizationRoutes);
app.use("/api/admin/customers", adminCustomerRoutes);
app.use("/api/collections", collectionRoutes);
app.use("/api/design-components", designComponentRoutes);
app.use("/api/templates", templateRoutes);
app.use("/api/designer/requests", designerRequestRoutes);
app.use("/api/admin", adminRoutes);
app.use('/api/orders', orderRoutes);

app.get("/", (req, res) => {
    res.status(200).json({
        success: true,
        message: "response from server 5000"
    })
});

const startServer = async()=>{
    try{
        await connectDB();

        app.listen(PORT,()=>{
            console.log(`Server is running in the port: ${PORT}`);
            
        })
    }catch(error){
        console.log(`server startup is failed: `, error.message);
        process.exit(1);
    }
}

startServer();