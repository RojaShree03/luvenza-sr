const User = require('../models/user')
const bcrypt = require('bcryptjs');

// register customer
const register = async(req,res)=>{

    try{
        // get reg data
        const {name, email, phone, password} = req.body

        // check email is already exists
        const existingUser = await User.findOne({email});

        if(existingUser){
            return res.status(409).json({
                success: false,
                message:'Email is already exists'
            });
        }
        // hash pass
        const hashedPassword = await bcrypt.hash(password, 12);

        // create new customer
        const newUser = await User.create({
            name,
            email,
            phone,
            password: hashedPassword,
            role: 'customer'
        });

        // res sending without password
        return res.status(201).json({
            success:true,
            message:'Registration Successful',
            user:{
                id: newUser._id,
                name: newUser.name,
                email:newUser.email,
                phone:newUser.phone,
                role:newUser.role
            }
        });

    }catch(error){
        // duplicate email db error
        if(error.code === 11000){
            return res.status(409).json({
                success:false,
                message:'Email is already registered'
            });

        }
        console.log('Registration Error: ',error);

        return res.status(500).json({
            success:false,
            message:'Internal server Error'
        });
    }
};

module.exports = {register};