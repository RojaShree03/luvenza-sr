const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv')

const app = express();
app.use(cors());
dotenv.config();
app.use(express.json());


app.get("/",(req,res)=>{
    res.json({"message":"response from server 5000"})
});

app.listen(process.env.PORT,(req,res)=>{
    console.log("server is runnning at the port ",process.env.PORT)
})