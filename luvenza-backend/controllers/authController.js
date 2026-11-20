const User = require('../models/user')
const bcrypt = require('bcryptjs');
const generateToken = require('../utils/generateToken');

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

const login = async(req, res) => {
    try {
        const {email, password} = req.body;
        const user = await User.findOne({email});

        if(!user){
            return res.status(404).json({
                success : false,
                message : 'User with this email is not found! Would you like to Signup ?'
            });
        }

        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Login Successful',
            token: generateToken(user._id),
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role
            }
        });
    } catch (error) {
        console.log('Login Error: ', error);

        return res.status(500).json({
            success: false,
            message: 'Internal server Error'
        });
    }
};

const logout = (req, res) => {
    res.clearCookie('token');

    return res.status(200).json({
        success: true,
        message: 'Logout Successful'
    });
};

const getCurrentUser = (req, res) => {
    return res.status(200).json({
        success: true,
        user: {
            id: req.user._id,
            name: req.user.name,
            email: req.user.email,
            phone: req.user.phone,
            role: req.user.role,
            isLoggedIn : true
        }
    });
};

module.exports = {
    register,
    login,
    logout,
    getCurrentUser
};