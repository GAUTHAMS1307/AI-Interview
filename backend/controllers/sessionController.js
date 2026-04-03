// controllers/sessionController.js
const Session  = require("../models/Session");
const Baseline = require("../models/Baseline");
const { computeCIS, computeSessionCIS } = require("../utils/cisCalculator");
const {
  generateQuestions,
  analyzeNlpAnswer,
  analyzeEyeFrame
} = require("../services/aiProvider");

const allowedDifficulties = new Set(["easy", "medium", "hard", "mixed"]);
const MIN_RELEVANCE_THRESHOLD = 0.35;
const MIN_COHERENCE_THRESHOLD = 0.35;
const MIN_KEYWORD_OVERLAP = 0.1;
const WRONG_ANSWER_MAX_SCORE = 0.2;
const SKIP_ANSWER_PATTERN =
  /(?:\bi\s*(?:do\s*not|don't)\s*know\b|\bno\s+idea\b|\bnot\s+sure\b|\bcan(?:not|'t)\s+answer\b|\bskip\b)/i;
const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "then", "else", "for", "to", "of", "in", "on", "at",
  "with", "by", "from", "is", "are", "was", "were", "be", "being", "been", "it", "this", "that",
  "these", "those", "as", "about", "into", "over", "under", "between", "how", "what", "why", "when",
  "where", "who", "whom", "which", "do", "does", "did", "can", "could", "should", "would", "your"
]);
const clampScore = (value, fallback = 0) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
};
const normalizeNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const hasMeaningfulTranscript = (value = "") => String(value || "").trim().split(/\s+/).filter(Boolean).length >= 3;
const tokenizeKeywords = (text = "") =>
  String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));

const computeKeywordOverlap = (questionText = "", transcript = "") => {
  const questionTokens = tokenizeKeywords(questionText);
  if (!questionTokens.length) return 0;
  const answerTokens = new Set(tokenizeKeywords(transcript));
  if (!answerTokens.size) return 0;
  const overlap = questionTokens.filter((token) => answerTokens.has(token)).length;
  return overlap / questionTokens.length;
};

const looksLikeSkipAnswer = (transcript = "") =>
  SKIP_ANSWER_PATTERN.test(String(transcript || ""));

// ── POST /api/session/start ───────────────────────────────────
// Creates a new in-progress session and returns session ID + questions
const startSession = async (req, res) => {
  try {
    const { role = "general", count = 8, difficulty = "mixed" } = req.body;
    const rawDifficulty = String(difficulty || "mixed").toLowerCase();
    const difficultyMode = allowedDifficulties.has(rawDifficulty) ? rawDifficulty : "mixed";
    const questionCount = Math.min(12, Math.max(1, Number(count) || 8));

    // Verify user has a baseline — block interview if not calibrated
    const baseline = await Baseline.findOne({ userId: req.user._id });
    if (!baseline) {
      return res.status(400).json({
        calibrated: false,
        message: "Please complete calibration before starting an interview."
      });
    }

    // Fetch AI-generated interview questions
    const qRes = await generateQuestions({ role, count: questionCount, difficulty: difficultyMode });
    const questions = Array.isArray(qRes?.questions) ? qRes.questions : [];
    if (!questions.length) {
      return res.status(502).json({ message: "Unable to generate interview questions. Please retry." });
    }

    // Create session document
    const session = await Session.create({
      userId: req.user._id,
      role,
      status: "in_progress",
      questions: []
    });

    res.status(201).json({
      sessionId: session._id,
      questions,
      difficulty: difficultyMode,
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

    const answered = hasMeaningfulTranscript(transcript);
    const relevanceScore = answered ? clampScore(RS) : 0;
    const coherenceScore = answered ? clampScore(DS) : 0;
    const keywordOverlap = answered ? computeKeywordOverlap(questionText, transcript) : 0;
    // Wrong/off-topic when:
    // 1) relevance alone is very low, or
    // 2) coherence is low AND question-keyword overlap is low, or
    // 3) user explicitly indicates skipping / not knowing.
    const wrongOrOffTopic = answered && (
      relevanceScore < MIN_RELEVANCE_THRESHOLD ||
      (coherenceScore < MIN_COHERENCE_THRESHOLD && keywordOverlap < MIN_KEYWORD_OVERLAP) ||
      looksLikeSkipAnswer(transcript)
    );

    const normalizedECS = answered ? clampScore(ECS) : 0;
    const normalizedVSS = answered ? clampScore(VSS) : 0;
    let normalizedAQS = 0;
    if (answered) {
      normalizedAQS = clampScore(AQS);
      if (wrongOrOffTopic) {
        normalizedAQS = Math.min(normalizedAQS, WRONG_ANSWER_MAX_SCORE);
      }
    }
    const normalizedECS2 = answered ? clampScore(ECS2) : 0;
    const normalizedGS = answered ? clampScore(GS) : 0;
    const normalizedRS = answered ? (wrongOrOffTopic ? Math.min(relevanceScore, WRONG_ANSWER_MAX_SCORE) : relevanceScore) : 0;
    const normalizedFS = answered ? clampScore(FS) : 0;
    const normalizedDS = answered ? (wrongOrOffTopic ? Math.min(coherenceScore, WRONG_ANSWER_MAX_SCORE) : coherenceScore) : 0;
    const normalizedSuggestions = Array.isArray(suggestions) ? suggestions.filter(Boolean).map(String) : [];
    if (wrongOrOffTopic) {
      normalizedSuggestions.unshift("Answer seems off-topic or incorrect. Focus directly on the question asked.");
    }

    // Compute CIS for this question
    const { CIS } = computeCIS({
      ECS: normalizedECS,
      VSS: normalizedVSS,
      AQS: normalizedAQS,
      ECS2: normalizedECS2
    });

    const questionScore = {
      questionId, questionText, category, difficulty,
      ECS: normalizedECS,
      VSS: normalizedVSS,
      AQS: normalizedAQS,
      ECS2: normalizedECS2,
      CIS,
      emotion_dev_pct: normalizeNumber(emotion_dev_pct, 0),
      voice_dev_pct: normalizeNumber(voice_dev_pct, 0),
      aqs_dev_pct: normalizeNumber(aqs_dev_pct, 0),
      eye_dev_pct: normalizeNumber(eye_dev_pct, 0),
      transcript: answered ? transcript : "",
      wpm: answered ? normalizeNumber(wpm, 0) : 0,
      filler_count: answered ? normalizeNumber(filler_count, 0) : 0,
      pause_count: answered ? normalizeNumber(pause_count, 0) : 0,
      GS: normalizedGS,
      RS: normalizedRS,
      FS: normalizedFS,
      DS: normalizedDS,
      dominant_emotion, suggestions,
      duration_sec: Number(duration_sec) || 0,
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
