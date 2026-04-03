// controllers/reportController.js
const Session = require("../models/Session");
const compareFeatureEnabled = String(process.env.FEATURE_REPORT_COMPARE || "false").toLowerCase() === "true";

// ── GET /api/report/:sessionId ────────────────────────────────
// Full structured report for dashboard display
const getReport = async (req, res) => {
  try {
    const session = await Session.findById(req.params.sessionId);
    if (!session)
      return res.status(404).json({ message: "Session not found" });

    if (session.userId.toString() !== req.user._id.toString())
      return res.status(403).json({ message: "Not authorized" });

    // Build per-question deviation timeline for Chart.js graphs
    const deviationTimeline = session.questions.map((q, idx) => ({
      question_num:    idx + 1,
      question_short:  q.questionText?.slice(0, 40) + "...",
      CIS:             q.CIS,
      ECS:             q.ECS,
      VSS:             q.VSS,
      AQS:             q.AQS,
      ECS2:            q.ECS2,
      emotion_dev_pct: q.emotion_dev_pct,
      voice_dev_pct:   q.voice_dev_pct,
      aqs_dev_pct:     q.aqs_dev_pct,
      eye_dev_pct:     q.eye_dev_pct,
      dominant_emotion: q.dominant_emotion,
      wpm:             q.wpm
    }));

    // Worst performing areas — for dashboard highlight
    const avgDevs = {
      emotion: session.scores.emotion_dev_avg,
      voice:   session.scores.voice_dev_avg,
      aqs:     session.scores.aqs_dev_avg,
      eye:     session.scores.eye_dev_avg
    };
    const worstArea = Object.entries(avgDevs)
      .sort((a, b) => b[1] - a[1])[0][0];

    res.json({
      sessionId:        session._id,
      role:             session.role,
      completedAt:      session.completedAt,
      duration_min:     session.duration_min,
      scores:           session.scores,
      top_suggestions:  session.top_suggestions,
      worst_area:       worstArea,
      deviation_timeline: deviationTimeline,
      question_details:   session.questions
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET /api/report/progress/all ──────────────────────────────
// CIS trend across sessions — for progress tracking chart
const getProgressHistory = async (req, res) => {
  try {
    const sessions = await Session.find({
      userId: req.user._id,
      status: "completed"
    })
      .select("scores startedAt duration_min role")
      .sort({ startedAt: 1 })
      .limit(30);

    const history = sessions.map((s, idx) => ({
      session_num:   idx + 1,
      date:          s.startedAt,
      role:          s.role,
      CIS:           s.scores.CIS_overall,
      ECS:           s.scores.ECS_avg,
      VSS:           s.scores.VSS_avg,
      AQS:           s.scores.AQS_avg,
      ECS2:          s.scores.ECS2_avg,
      duration_min:  s.duration_min
    }));

    // Trend: is the user improving?
    let trend = "neutral";
    if (history.length >= 3) {
      const recent = history.slice(-3).map(h => h.CIS);
      const older  = history.slice(-6, -3).map(h => h.CIS);
      if (older.length > 0) {
        const recentAvg = recent.reduce((a,b)=>a+b,0)/recent.length;
        const olderAvg  = older.reduce((a,b)=>a+b,0)/older.length;
        trend = recentAvg > olderAvg + 0.03 ? "improving"
              : recentAvg < olderAvg - 0.03 ? "declining"
              : "stable";
      }
    }

    res.json({ history, trend, total_sessions: history.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ── GET /api/report/compare/last5 ───────────────────────────────
// Last 5 completed sessions for quick comparison chart
const getLastFiveComparison = async (req, res) => {
  try {
    if (!compareFeatureEnabled) {
      return res.status(404).json({ message: "Comparison feature is disabled" });
    }

    const sessions = await Session.find({
      userId: req.user._id,
      status: "completed"
    })
      .select("scores startedAt duration_min role")
      .sort({ startedAt: -1 })
      .limit(5);

    const comparison = sessions
      .reverse()
      .map((s, idx) => ({
        session_num: idx + 1,
        session_id: s._id,
        date: s.startedAt,
        role: s.role,
        CIS: s.scores?.CIS_overall || 0,
        ECS: s.scores?.ECS_avg || 0,
        VSS: s.scores?.VSS_avg || 0,
        AQS: s.scores?.AQS_avg || 0,
        ECS2: s.scores?.ECS2_avg || 0,
        duration_min: s.duration_min || 0
      }));

    res.json({ comparison, total_sessions: comparison.length });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

module.exports = { getReport, getProgressHistory, getLastFiveComparison };
