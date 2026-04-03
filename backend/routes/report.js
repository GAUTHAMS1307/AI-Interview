// routes/report.js
const express = require("express");
const router  = express.Router();
const { getReport, getProgressHistory, getLastFiveComparison } =
  require("../controllers/reportController");
const { protect } = require("../middleware/authMiddleware");
const { createInMemoryRateLimiter } = require("../middleware/rateLimit");
const reportRateLimiter = createInMemoryRateLimiter();

// GET /api/report/progress/all  — CIS trend across all sessions
router.get("/progress/all",     protect, reportRateLimiter, getProgressHistory);

// GET /api/report/compare/last5 — last 5 completed sessions
router.get("/compare/last5",    protect, reportRateLimiter, getLastFiveComparison);

// GET /api/report/:sessionId    — full report for one session detail
router.get("/:sessionId",       protect, reportRateLimiter, getReport);

module.exports = router;
