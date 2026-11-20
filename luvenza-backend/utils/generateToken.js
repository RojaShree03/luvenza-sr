const jwt = require('jsonwebtoken');

const generateToken = (userId) => jwt.sign(
    {userId: userId.toString()},
    process.env.JWT_SECRET,
    {expiresIn: '1d'}
);

module.exports = generateToken;