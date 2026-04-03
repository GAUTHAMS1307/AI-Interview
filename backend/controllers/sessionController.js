// controllers/sessionController.js
const Session  = require("../models/Session");
const Baseline = require("../models/Baseline");
const { computeCIS, computeSessionCIS } = require("../utils/cisCalculator");
const {
  generateQuestions,
  analyzeNlpAnswer,
  analyzeEyeFrame
} = require("../services/aiProvider");

// ── POST /api/session/start ───────────────────────────────────
// Creates a new in-progress session and returns session ID + questions
const startSession = async (req, res) => {
  try {
    const { role = "general", count = 8 } = req.body;

    // Verify user has a baseline — block interview if not calibrated
    const baseline = await Baseline.findOne({ userId: req.user._id });
    if (!baseline) {
      return res.status(400).json({
        calibrated: false,
        message: "Please complete calibration before starting an interview."
      });
    }

    // Fetch AI-generated interview questions
    const qRes = await generateQuestions({ role, count });

    // Create session document
    const session = await Session.create({
      userId: req.user._id,
      role,
      status: "in_progress",
      questions: []
    });

    res.status(201).json({
      sessionId: session._id,
      questions: qRes.data.questions,
      baseline: {
        emotion_ECS: baseline.emotion.baseline_ECS,
        voice:       baseline.voice,
        eye:         baseline.eye,
        stt:         baseline.stt
      }
    });
  } catch (err) {
    console.error("[Session Start] Error:", err.message);
    res.status(500).json({ message: err.message });
  }
};

// ── POST /api/session/:id/question ───────────────────────────
// Called after each answer. Receives raw ML scores and stores them.
const saveQuestionScore = async (req, res) => {
  try {
    const { id: sessionId } = req.params;
    const {
      questionId, questionText, category, difficulty,
      ECS, VSS, AQS, ECS2,               // raw ML scores (0–1)
      emotion_dev_pct, voice_dev_pct,     // deviations (%)
      aqs_dev_pct, eye_dev_pct,
      transcript, wpm, filler_count, pause_count,
      GS, RS, FS, DS,
      dominant_emotion, suggestions,
      duration_sec
    } = req.body;

    // Compute CIS for this question
    const { CIS } = computeCIS({ ECS, VSS, AQS, ECS2 });

    const questionScore = {
      questionId, questionText, category, difficulty,
      ECS, VSS, AQS, ECS2, CIS,
      emotion_dev_pct, voice_dev_pct, aqs_dev_pct, eye_dev_pct,
      transcript, wpm, filler_count, pause_count,
      GS, RS, FS, DS,
      dominant_emotion, suggestions,
      duration_sec,
      answeredAt: new Date()
    };

    // Push to session's questions array
    await Session.findByIdAndUpdate(sessionId, {
      $push: { questions: questionScore }
    });

    res.json({ message: "Question score saved", CIS });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── PUT /api/session/:id/complete ─────────────────────────────
// Finalizes the session — computes session-level CIS + suggestions
const completeSession = async (req, res) => {
  try {
    const { id: sessionId } = req.params;

    const session = await Session.findById(sessionId);
    if (!session)
      return res.status(404).json({ message: "Session not found" });

    if (session.userId.toString() !== req.user._id.toString())
      return res.status(403).json({ message: "Not authorized" });

    // Aggregate session-level scores
    const sessionScores = computeSessionCIS(session.questions);

    // Collect top suggestions across all questions (deduplicated)
    const allSuggestions = session.questions
      .flatMap(q => q.suggestions || [])
      .filter(Boolean);
    const uniqueSuggestions = [...new Set(allSuggestions)].slice(0, 5);

    // Duration in minutes
    const durationMin = parseFloat(
      ((Date.now() - session.startedAt.getTime()) / 60000).toFixed(1)
    );

    // Update session
    const updated = await Session.findByIdAndUpdate(
      sessionId,
      {
        status:          "completed",
        scores:          sessionScores,
        top_suggestions: uniqueSuggestions,
        completedAt:     new Date(),
        duration_min:    durationMin
      },
      { new: true }
    );

    res.json({
      message:  "Session completed",
      sessionId,
      scores:   sessionScores,
      duration_min: durationMin,
      top_suggestions: uniqueSuggestions
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET /api/session/all ──────────────────────────────────────
const getSessions = async (req, res) => {
  try {
    const sessions = await Session.find({
      userId: req.user._id,
      status: "completed"
    })
      .select("role scores startedAt completedAt duration_min")
      .sort({ startedAt: -1 })
      .limit(20);

    res.json({ sessions });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET /api/session/:id ──────────────────────────────────────
const getSessionById = async (req, res) => {
  try {
    const session = await Session.findById(req.params.id);
    if (!session)
      return res.status(404).json({ message: "Session not found" });

    if (session.userId.toString() !== req.user._id.toString())
      return res.status(403).json({ message: "Not authorized" });

    res.json({ session });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── POST /api/session/analyze ───────────────────────────────────
// Proxies NLP + Eye calls to AI provider so frontend only talks to backend
const analyzeAnswer = async (req, res) => {
  try {
    const { audio, frame, question, baseline_stt, baseline_gaze } = req.body;
    const [nlpRes, eyeRes] = await Promise.all([
      analyzeNlpAnswer({ audio, question, baseline_stt }),
      analyzeEyeFrame({ frame, baseline_gaze })
    ]);

    res.json({
      nlp: nlpRes,
      eye: eyeRes
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  startSession, saveQuestionScore, completeSession,
  getSessions,  getSessionById, analyzeAnswer
};
