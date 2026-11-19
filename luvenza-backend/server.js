const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');


// const jwt = require('jsonwebtoken');

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