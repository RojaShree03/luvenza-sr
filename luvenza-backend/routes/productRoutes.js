const express = require('express');
const router = express.Router();

const { getAllProducts,
    getProductById,
    createProduct,
    updateProduct,
    patchProduct,
    deleteProduct } = require('../controllers/productController');

const authMiddleware = require('../middleware/authMiddleware');
const authorizeRoles = require('../middleware/roleMiddleware');

router.get('/', authMiddleware, authorizeRoles('admin', 'customer', 'tailor'), getAllProducts);

router.get('/:id', authMiddleware, authorizeRoles('admin', 'customer', 'tailor'), getProductById);

router.post('/', authMiddleware, authorizeRoles('admin'), createProduct);

router.put('/:id', authMiddleware, authorizeRoles('admin'), updateProduct);

router.patch('/:id', authMiddleware, authorizeRoles('admin'), patchProduct);

router.delete('/:id', authMiddleware, authorizeRoles('admin'), deleteProduct);

module.exports = router;