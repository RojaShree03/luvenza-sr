const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const {
    createDesignComponent,
    getDesignComponents
} = require("../controllers/designComponentController");

router.use(authMiddleware, authorizeRoles("admin"));

router.post("/", createDesignComponent);
router.get("/", getDesignComponents);

module.exports = router;