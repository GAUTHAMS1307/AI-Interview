// models/Baseline.js
// Stores the personalized baseline feature vector per user
const mongoose = require("mongoose");

const BaselineSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User", required: true, unique: true
  },

  // ── Emotion baseline (from Emotion CNN during calibration) ──
  emotion: {
    baseline_ECS:      { type: Number, default: 0.7 },
    baseline_probs:    { type: Object, default: {} },  // { Happy: 0.4, Neutral: 0.5, ... }
    baseline_dominant: { type: String, default: "Neutral" },
    frames_processed:  { type: Number, default: 0 }
  },

  // ── Voice baseline (from Voice LSTM during calibration) ─────
  voice: {
    baseline_VSS:        { type: Number, default: 0.65 },
    baseline_pitch:      { type: Number, default: 150.0 },
    baseline_pitch_std:  { type: Number, default: 20.0 },
    baseline_energy:     { type: Number, default: 0.05 },
    baseline_wpm:        { type: Number, default: 130.0 },
    baseline_pause_rate: { type: Number, default: 0.3 },
    baseline_mfcc_means: { type: [Number], default: [] },
    segments_processed:  { type: Number, default: 0 }
  },

  // ── Eye contact baseline (from MediaPipe during calibration) ─
  eye: {
    baseline_gaze_ratio:  { type: Number, default: 0.75 },  // % looking at camera
    baseline_blink_rate:  { type: Number, default: 15.0 },  // blinks per minute
    frames_processed:     { type: Number, default: 0 }
  },

  // ── STT/NLP baseline (from Vosk during calibration) ─────────
  stt: {
    baseline_wpm:          { type: Number, default: 130.0 },
    baseline_filler_rate:  { type: Number, default: 5.0 },
    baseline_pause_count:  { type: Number, default: 2.0 },
    baseline_speech_ratio: { type: Number, default: 0.85 },
    segments_processed:    { type: Number, default: 0 }
  },

  calibratedAt:   { type: Date, default: Date.now },
  updatedAt:      { type: Date, default: Date.now }
});

// Update timestamp on save
BaselineSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("Baseline", BaselineSchema);
