const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/authMiddleware');

const {
    getWishlist,
    addToWishlist,
    updateWishlist,
    removeFromWishlist
} = require('../controllers/wishlistController');

router.get('/', authMiddleware, getWishlist);
router.post('/', authMiddleware, addToWishlist);
router.put('/', authMiddleware, updateWishlist);
router.delete('/:productId', authMiddleware, removeFromWishlist);

module.exports = router;