// routes/session.js
const express = require("express");
const router  = express.Router();
const {
  startSession,
  saveQuestionScore,
  completeSession,
  getSessions,
  getSessionById,
  analyzeAnswer
} = require("../controllers/sessionController");
const { protect } = require("../middleware/authMiddleware");

// POST /api/session/start               — create new session
router.post("/start",                 protect, startSession);

// POST /api/session/:id/question        — save one question's scores
router.post("/:id/question",          protect, saveQuestionScore);

// PUT  /api/session/:id/complete        — finalize session + compute CIS
router.put("/:id/complete",           protect, completeSession);

// POST /api/session/analyze             — proxy NLP + eye analysis
router.post("/analyze",                protect, analyzeAnswer);

// GET  /api/session/all                 — list all sessions for user
router.get("/all",                    protect, getSessions);

// GET  /api/session/:id                 — get single session detail
router.get("/:id",                    protect, getSessionById);

module.exports = router;
