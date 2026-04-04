// controllers/reportController.js
const mongoose = require("mongoose");
const Session = require("../models/Session");
const compareFeatureEnabled = String(process.env.FEATURE_REPORT_COMPARE || "false").toLowerCase() === "true";

// ── GET /api/report/:sessionId ────────────────────────────────
// Full structured report for dashboard display
const getReport = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.sessionId))
      return res.status(404).json({ message: "Session not found" });

    const session = await Session.findById(req.params.sessionId);
    if (!session)
      return res.status(404).json({ message: "Session not found" });

    if (session.userId.toString() !== req.user._id.toString())
      return res.status(403).json({ message: "Not authorized" });

    // Build per-question deviation timeline for Chart.js graphs
    const deviationTimeline = session.questions.map((q, idx) => ({
      question_num:    idx + 1,
      question_short:  q.questionText?.slice(0, 40) + "...",
      CIS:             q.CIS || 0,
      ECS:             q.ECS || 0,
      VSS:             q.VSS || 0,
      AQS:             q.AQS || 0,
      ECS2:            q.ECS2 || 0,
      emotion_dev_pct: q.emotion_dev_pct || 0,
      voice_dev_pct:   q.voice_dev_pct || 0,
      aqs_dev_pct:     q.aqs_dev_pct || 0,
      eye_dev_pct:     q.eye_dev_pct || 0,
      dominant_emotion: q.dominant_emotion,
      wpm:             q.wpm || 0
    }));

    // Worst performing areas — for dashboard highlight
    const scores = session.scores || {};
    const avgDevs = {
      emotion: scores.emotion_dev_avg || 0,
      voice:   scores.voice_dev_avg   || 0,
      aqs:     scores.aqs_dev_avg     || 0,
      eye:     scores.eye_dev_avg     || 0
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
    const query = { userId: req.user._id, status: "completed" };

    // Fetch total count and most recent 30 sessions in parallel
    const [totalCount, rawSessions] = await Promise.all([
      Session.countDocuments(query),
      Session.find(query)
        .select("scores startedAt duration_min role")
        .sort({ startedAt: -1 })
        .limit(30)
    ]);

    // Reverse so the chart renders oldest → newest (chronological order)
    const sessions = rawSessions.reverse();

    const history = sessions.map((s, idx) => ({
      session_num:   idx + 1,
      date:          s.startedAt,
      role:          s.role,
      CIS:           s.scores?.CIS_overall || 0,
      ECS:           s.scores?.ECS_avg     || 0,
      VSS:           s.scores?.VSS_avg     || 0,
      AQS:           s.scores?.AQS_avg     || 0,
      ECS2:          s.scores?.ECS2_avg    || 0,
      duration_min:  s.duration_min        || 0
    }));

    // Trend: is the user improving? (compare most recent 3 vs previous 3)
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

    res.json({ history, trend, total_sessions: totalCount });
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
