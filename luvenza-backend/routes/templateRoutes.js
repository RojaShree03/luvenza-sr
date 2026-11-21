const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const {
    createTemplate,
    getTemplates
} = require("../controllers/templateController");

router.use(authMiddleware, authorizeRoles("admin"));

router.post("/", createTemplate);
router.get("/", getTemplates);

module.exports = router;