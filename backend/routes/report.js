// routes/report.js
const express = require("express");
const rateLimit = require("express-rate-limit");
const router  = express.Router();
const { getReport, getProgressHistory, getLastFiveComparison } =
  require("../controllers/reportController");
const { protect } = require("../middleware/authMiddleware");
const reportRateLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60_000),
  limit: Number(process.env.RATE_LIMIT_MAX_REQUESTS || 60),
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again shortly." }
});

// GET /api/report/progress/all  — CIS trend across all sessions
router.get("/progress/all",     protect, reportRateLimiter, getProgressHistory);

// GET /api/report/compare/last5 — last 5 completed sessions
router.get("/compare/last5",    protect, reportRateLimiter, getLastFiveComparison);

// GET /api/report/:sessionId    — full report for one session detail
router.get("/:sessionId",       protect, reportRateLimiter, getReport);

module.exports = router;
