const express = require("express");
const router = express.Router();

const authMiddleware = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");

const {
    getCustomizationRequests,
    approveRequest,
    suggestAlternative,
    rejectRequest
} = require("../controllers/designerRequestController");

router.use(authMiddleware, authorizeRoles("admin"));

router.get("/", getCustomizationRequests);
router.put("/:id/approve", approveRequest);
router.put("/:id/suggest", suggestAlternative);
router.put("/:id/reject", rejectRequest);

module.exports = router;