// models/Session.js
// Stores one complete interview session with per-question scores
const mongoose = require("mongoose");

// ── Per-question score subdocument ───────────────────────────
const QuestionScoreSchema = new mongoose.Schema({
  questionId:   String,
  questionText: String,
  category:     String,
  difficulty:   Number,

  // Raw scores (0–1) from each ML model
  ECS:          Number,   // Emotion Confidence Score
  VSS:          Number,   // Voice Stability Score
  AQS:          Number,   // Answer Quality Score
  ECS2:         Number,   // Eye Contact Score

  // CIS formula result for this question
  CIS:          Number,

  // Deviation from baseline (%) per component
  emotion_dev_pct: Number,
  voice_dev_pct:   Number,
  aqs_dev_pct:     Number,
  eye_dev_pct:     Number,

  // Transcript + detailed NLP breakdown
  transcript:   String,
  wpm:          Number,
  filler_count: Number,
  pause_count:  Number,
  GS: Number, RS: Number, FS: Number, DS: Number,

  // Emotion detected
  dominant_emotion: String,

  // Per-question suggestions
  suggestions:  [String],

  answeredAt:   { type: Date, default: Date.now },
  duration_sec: Number
}, { _id: false });


// ── Main session schema ───────────────────────────────────────
const SessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User", required: true
  },

  // Session metadata
  role:       { type: String, default: "general" },
  status:     { type: String, enum: ["in_progress", "completed", "abandoned"],
                default: "in_progress" },

  // Per-question scores array
  questions:  [QuestionScoreSchema],

  // Session-level aggregated scores
  scores: {
    CIS_overall:    { type: Number, default: 0 },
    ECS_avg:        { type: Number, default: 0 },
    VSS_avg:        { type: Number, default: 0 },
    AQS_avg:        { type: Number, default: 0 },
    ECS2_avg:       { type: Number, default: 0 },
    // Deviation from baseline (%) at session level
    emotion_dev_avg:  { type: Number, default: 0 },
    voice_dev_avg:    { type: Number, default: 0 },
    aqs_dev_avg:      { type: Number, default: 0 },
    eye_dev_avg:      { type: Number, default: 0 }
  },

  // Top suggestions for this session
  top_suggestions: [String],

  startedAt:   { type: Date, default: Date.now },
  completedAt: { type: Date },
  duration_min: { type: Number, default: 0 }
});

// Compound index for the most common query pattern:
// find completed sessions for a user, sorted by date
SessionSchema.index({ userId: 1, status: 1, startedAt: -1 });

module.exports = mongoose.model("Session", SessionSchema);
