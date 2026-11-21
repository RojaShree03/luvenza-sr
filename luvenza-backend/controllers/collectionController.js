const Collection = require("../models/collection");

// POST /api/collections
exports.createCollection = async (req, res) => {
    try {
        const collection = await Collection.create(req.body);

        res.status(201).json({
            message: "Collection created successfully",
            collection
        });
    } catch (error) {
        res.status(400).json({
            message: "Failed to create collection",
            error: error.message
        });
    }
};

// GET /api/collections
exports.getCollections = async (req, res) => {
    try {
        const collections = await Collection.find()
            .populate("category")
            .sort({ createdAt: -1 });

        res.status(200).json({
            count: collections.length,
            collections
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to fetch collections",
            error: error.message
        });
    }
};

// PUT /api/collections/:id
exports.updateCollection = async (req, res) => {
    try {
        const allowedFields = [
            "name",
            "description",
            "coverImage",
            "images",
            "category",
            "isActive"
        ];

        const updates = {};

        allowedFields.forEach((field) => {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        });

        const collection = await Collection.findByIdAndUpdate(
            req.params.id,
            { $set: updates },
            { new: true, runValidators: true }
        );

        if (!collection) {
            return res.status(404).json({
                message: "Collection not found"
            });
        }

        res.status(200).json({
            message: "Collection updated successfully",
            collection
        });
    } catch (error) {
        res.status(400).json({
            message: "Failed to update collection",
            error: error.message
        });
    }
};

// DELETE /api/collections/:id
exports.deleteCollection = async (req, res) => {
    try {
        const collection = await Collection.findByIdAndUpdate(
            req.params.id,
            { isActive: false },
            { new: true }
        );

        if (!collection) {
            return res.status(404).json({
                message: "Collection not found"
            });
        }

        res.status(200).json({
            message: "Collection deactivated successfully"
        });
    } catch (error) {
        res.status(500).json({
            message: "Failed to delete collection",
            error: error.message
        });
    }
};