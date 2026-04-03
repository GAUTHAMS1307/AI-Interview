// routes/report.js
const express = require("express");
const router  = express.Router();
const { getReport, getProgressHistory } =
  require("../controllers/reportController");
const { protect } = require("../middleware/authMiddleware");

// GET /api/report/:sessionId    — full report for one session
router.get("/:sessionId",       protect, getReport);

// GET /api/report/progress/all  — CIS trend across all sessions
router.get("/progress/all",     protect, getProgressHistory);

module.exports = router;
