const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const app = express();
const jwt = require('jsonwebtoken');

app.use(cors());
dotenv.config();
app.use(express.json());
app.use(helmet());
app.use(morgan("dev"));
app.use(cookieParser());


app.get("/",(req,res)=>{
    res.json({"message":"response from server 5000"})
});

app.listen(process.env.PORT,(req,res)=>{
    console.log("server is runnning at the port ",process.env.PORT)
})