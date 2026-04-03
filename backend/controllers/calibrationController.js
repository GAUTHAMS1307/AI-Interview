// controllers/calibrationController.js
const Baseline = require("../models/Baseline");
const {
  calibrateEmotion,
  calibrateVoice,
  calibrateEye,
  calibrateStt
} = require("../services/aiProvider");

// ── POST /api/calibration/save ────────────────────────────────
// Called after 90-second calibration session.
// Frontend sends collected frames + audio segments as base64 arrays.
const saveBaseline = async (req, res) => {
  try {
    const userId = req.user._id;
    const { frames, audio_segments } = req.body;
    // frames         — array of base64 JPEG strings (webcam frames)
    // audio_segments — array of base64 WAV buffers  (audio chunks)

    if (!frames || !audio_segments)
      return res.status(400).json({ message: "frames and audio_segments required" });

    // ── Call AI provider to compute all baselines ──────────────
    const [emotionRes, voiceRes, eyeRes, sttRes] = await Promise.all([
      calibrateEmotion({ frames }),
      calibrateVoice({ audio_segments }),
      calibrateEye({ frames }),
      calibrateStt({ audio_segments })
    ]);

    // ── Save / update baseline in MongoDB ─────────────────────
    const baseline = await Baseline.findOneAndUpdate(
      { userId },
      {
        userId,
        emotion: emotionRes,
        voice:   voiceRes,
        eye:     eyeRes,
        stt:     sttRes,
        calibratedAt: new Date()
      },
      { upsert: true, new: true }
    );

    res.json({
      message:  "Baseline saved successfully",
      baseline: {
        emotion_ECS:  baseline.emotion.baseline_ECS,
        voice_VSS:    baseline.voice.baseline_VSS,
        eye_gaze:     baseline.eye.baseline_gaze_ratio,
        wpm:          baseline.stt.baseline_wpm,
        calibratedAt: baseline.calibratedAt
      }
    });
  } catch (err) {
    console.error("[Calibration] Error:", err.message);
    res.status(500).json({ message: err.message });
  }
};

// ── GET /api/calibration/me ───────────────────────────────────
const getBaseline = async (req, res) => {
  try {
    const baseline = await Baseline.findOne({ userId: req.user._id });

    if (!baseline) {
      // Return 200 with calibrated:false instead of 404
      // This prevents frontend Promise.all from throwing on first load
      return res.status(200).json({
        calibrated: false,
        baseline:   null,
        message:    "No baseline found. Please complete calibration first."
      });
    }

    res.json({ calibrated: true, baseline });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { saveBaseline, getBaseline };
