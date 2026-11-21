const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const {
    createCollection,
    getCollections,
    updateCollection,
    deleteCollection
} = require("../controllers/collectionController");

router.use(authMiddleware, authorizeRoles("admin"));

router.post("/", createCollection);
router.get("/", getCollections);
router.put("/:id", updateCollection);
router.delete("/:id", deleteCollection);

module.exports = router;