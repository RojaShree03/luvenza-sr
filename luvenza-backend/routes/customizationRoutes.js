const express = require('express');
const router = express.Router();

const authMiddleware = require('../middleware/authMiddleware');

const {
    getCustomizations,
    getCustomizationById,
    createCustomization,
    updateCustomization,
    deleteCustomization
} = require('../controllers/customizationController');

router.get('/', authMiddleware, getCustomizations);
router.get('/:id', authMiddleware, getCustomizationById);
router.post('/', authMiddleware, createCustomization);
router.put('/:id', authMiddleware, updateCustomization);
router.delete('/:id', authMiddleware, deleteCustomization);

module.exports = router;