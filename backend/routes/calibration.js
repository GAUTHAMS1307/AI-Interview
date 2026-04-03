// routes/calibration.js
const express = require("express");
const router  = express.Router();
const { saveBaseline, getBaseline } =
  require("../controllers/calibrationController");
const { protect } = require("../middleware/authMiddleware");

// POST /api/calibration/save  — save baseline after 90s calibration
router.post("/save",  protect, saveBaseline);

// GET  /api/calibration/me    — get current user's baseline
router.get("/me",    protect, getBaseline);

module.exports = router;
