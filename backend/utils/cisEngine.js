// utils/cisEngine.js
// ============================================================
// PMCIS — Confidence Intelligence Score (CIS) Engine
// ============================================================
//
// CIS Formula:
//   CIS = w1·ECS + w2·VSS + w3·AQS + w4·ECS2
//
//   ECS  = Emotion Confidence Score     (w1 = 0.30)
//   VSS  = Voice Stability Score        (w2 = 0.25)
//   AQS  = Answer Quality Score         (w3 = 0.30)
//   ECS2 = Eye Contact Score            (w4 = 0.15)
//
// Deviation Formula (Personalized Baseline Calibration):
//   Δ_feature = |session_value − baseline_value| / baseline_value
//   Δ_normalized = min(Δ_feature, 1.0)
//
// All scores and deviations are normalized to [0, 1].
// ============================================================

// ── Weight configuration ──────────────────────────────────────
const WEIGHTS = {
  ECS:  0.30,
  VSS:  0.25,
  AQS:  0.30,
  ECS2: 0.15
};

// ── Deviation alert threshold ─────────────────────────────────
const ALERT_THRESHOLD_PCT = 35.0;  // flag if deviation > 35%

// ── Grade thresholds ──────────────────────────────────────────
const GRADE_THRESHOLDS = [
  { min: 0.85, grade: "A", label: "Excellent",    color: "#48bb78" },
  { min: 0.70, grade: "B", label: "Good",         color: "#4299e1" },
  { min: 0.55, grade: "C", label: "Average",      color: "#ecc94b" },
  { min: 0.40, grade: "D", label: "Below Average",color: "#f6ad55" },
  { min: 0.00, grade: "F", label: "Poor",         color: "#fc8181" }
];


// ════════════════════════════════════════════════════════════
// SECTION 1 — PER-QUESTION CIS
// ════════════════════════════════════════════════════════════

/**
 * computeQuestionCIS
 * -----------------------------------------------------------------
 * Computes the CIS score for a single interview question-answer pair.
 *
 * Each sub-score has already been produced by the ML models:
 *   ECS  — output of inference_emotion.py  → deviation-adjusted
 *   VSS  — output of inference_voice.py    → deviation-adjusted
 *   AQS  — output of nlp_scorer.py         → deviation-adjusted
 *   ECS2 — output of inference_eye.py      → deviation-adjusted
 *
 * @param  {Object} scores — { ECS, VSS, AQS, ECS2 }  all in [0,1]
 * @returns {Object}
 */
const computeQuestionCIS = (scores) => {
  const ECS  = clamp(scores.ECS  ?? 0.5);
  const VSS  = clamp(scores.VSS  ?? 0.5);
  const AQS  = clamp(scores.AQS  ?? 0.5);
  const ECS2 = clamp(scores.ECS2 ?? 0.5);

  const CIS = round4(
    WEIGHTS.ECS  * ECS  +
    WEIGHTS.VSS  * VSS  +
    WEIGHTS.AQS  * AQS  +
    WEIGHTS.ECS2 * ECS2
  );

  const gradeInfo = getGradeInfo(CIS);

  return {
    CIS,
    ECS, VSS, AQS, ECS2,
    weights:    { ...WEIGHTS },
    grade:      gradeInfo.grade,
    grade_label:gradeInfo.label,
    color:      gradeInfo.color
  };
};


// ════════════════════════════════════════════════════════════
// SECTION 2 — SESSION-LEVEL CIS
// ════════════════════════════════════════════════════════════

/**
 * computeSessionCIS
 * -----------------------------------------------------------------
 * Aggregates all per-question scores into session-level metrics.
 *
 * Also computes:
 *   - Score trajectory (improving / degrading / stable across Qs)
 *   - Weakest component (lowest avg sub-score)
 *   - Worst deviation (highest avg deviation %)
 *
 * @param  {Array} questionScores — array of computeQuestionCIS results
 *                                  with additional deviation fields
 * @returns {Object}
 */
const computeSessionCIS = (questionScores) => {
  if (!questionScores || questionScores.length === 0) {
    return _emptySessionScores();
  }

  const n = questionScores.length;

  // ── Average each component ────────────────────────────────
  const avg = (key) => round4(
    questionScores.reduce((sum, q) => sum + (q[key] || 0), 0) / n
  );

  const ECS_avg  = avg("ECS");
  const VSS_avg  = avg("VSS");
  const AQS_avg  = avg("AQS");
  const ECS2_avg = avg("ECS2");

  const CIS_overall = round4(
    WEIGHTS.ECS  * ECS_avg  +
    WEIGHTS.VSS  * VSS_avg  +
    WEIGHTS.AQS  * AQS_avg  +
    WEIGHTS.ECS2 * ECS2_avg
  );

  // ── Average deviations ────────────────────────────────────
  const emotion_dev_avg = avg("emotion_dev_pct");
  const voice_dev_avg   = avg("voice_dev_pct");
  const aqs_dev_avg     = avg("aqs_dev_pct");
  const eye_dev_avg     = avg("eye_dev_pct");

  // ── Score trajectory (first half vs second half of session) ─
  const half     = Math.floor(n / 2);
  const firstHalf  = questionScores.slice(0, half || 1)
                       .reduce((s, q) => s + q.CIS, 0) / (half || 1);
  const secondHalf = questionScores.slice(half)
                       .reduce((s, q) => s + q.CIS, 0) /
                       (questionScores.length - half || 1);
  const trajectory =
    secondHalf > firstHalf + 0.05 ? "improving"  :
    secondHalf < firstHalf - 0.05 ? "degrading"  : "stable";

  // ── Weakest component ─────────────────────────────────────
  const components = { ECS: ECS_avg, VSS: VSS_avg,
                        AQS: AQS_avg, ECS2: ECS2_avg };
  const weakest = Object.entries(components)
    .sort((a, b) => a[1] - b[1])[0][0];

  // ── Highest deviation area ────────────────────────────────
  const deviations = {
    emotion: emotion_dev_avg, voice: voice_dev_avg,
    answer:  aqs_dev_avg,     eye:   eye_dev_avg
  };
  const worstDevArea = Object.entries(deviations)
    .sort((a, b) => b[1] - a[1])[0][0];

  const gradeInfo = getGradeInfo(CIS_overall);

  return {
    CIS_overall,
    ECS_avg, VSS_avg, AQS_avg, ECS2_avg,
    emotion_dev_avg, voice_dev_avg,
    aqs_dev_avg,     eye_dev_avg,
    trajectory,
    weakest_component: weakest,
    worst_dev_area:    worstDevArea,
    grade:             gradeInfo.grade,
    grade_label:       gradeInfo.label,
    color:             gradeInfo.color,
    question_count:    n
  };
};


// ════════════════════════════════════════════════════════════
// SECTION 3 — DEVIATION ENGINE
// ════════════════════════════════════════════════════════════

/**
 * computeDeviationScore
 * -----------------------------------------------------------------
 * Core personalized baseline deviation formula.
 *
 * Formula:
 *   Δ = |current − baseline| / |baseline|
 *   Δ_normalized = min(Δ, 1.0)
 *   score = 1 − Δ_normalized   (higher = closer to baseline)
 *
 * @param  {number} current   — value measured during interview
 * @param  {number} baseline  — user's personal calibration value
 * @returns {Object}
 */
const computeDeviationScore = (current, baseline) => {
  if (baseline == null || Math.abs(baseline) < 1e-9) {
    return { deviation: 0, deviation_pct: 0, score: 1.0,
             direction: "neutral", alert: false };
  }

  const raw_deviation = Math.abs(current - baseline) / Math.abs(baseline);
  const deviation     = Math.min(raw_deviation, 1.0);
  const deviation_pct = round2(deviation * 100);
  const score         = round4(1.0 - deviation);
  const direction     = current > baseline ? "above" : "below";
  const alert         = deviation_pct > ALERT_THRESHOLD_PCT;

  return { deviation: round4(deviation), deviation_pct,
           score, direction, alert };
};


/**
 * computeAllDeviations
 * -----------------------------------------------------------------
 * Computes per-component deviations for one question answer.
 * Called after each answer is submitted.
 *
 * @param  {Object} session_values  — { ECS_raw, VSS_raw, AQS, ECS2_raw,
 *                                      pitch, wpm, energy, gaze_ratio }
 * @param  {Object} baseline        — user's Baseline MongoDB document
 * @returns {Object}                — full deviation breakdown
 */
const computeAllDeviations = (session_values, baseline) => {
  const em = baseline.emotion || {};
  const vo = baseline.voice   || {};
  const ey = baseline.eye     || {};
  const st = baseline.stt     || {};

  // ── Emotion deviation ─────────────────────────────────────
  const emotionDev = computeDeviationScore(
    session_values.ECS_raw ?? 0.7,
    em.baseline_ECS        ?? 0.7
  );

  // ── Voice deviation (composite of pitch + energy + WPM) ──
  const pitchDev  = computeDeviationScore(
    session_values.pitch  ?? 150,
    vo.baseline_pitch     ?? 150
  );
  const energyDev = computeDeviationScore(
    session_values.energy ?? 0.05,
    vo.baseline_energy    ?? 0.05
  );
  const wpmDev = computeDeviationScore(
    session_values.wpm ?? 130,
    st.baseline_wpm    ?? 130
  );
  // Weighted voice deviation: pitch(35%) + energy(30%) + wpm(35%)
  const voiceDev_pct = round2(
    0.35 * pitchDev.deviation_pct  +
    0.30 * energyDev.deviation_pct +
    0.35 * wpmDev.deviation_pct
  );
  const voiceAlert = voiceDev_pct > ALERT_THRESHOLD_PCT;

  // ── Answer quality deviation ──────────────────────────────
  const fillerDev = computeDeviationScore(
    session_values.filler_rate ?? 5,
    st.baseline_filler_rate    ?? 5
  );
  const pauseDev = computeDeviationScore(
    session_values.pause_count ?? 2,
    st.baseline_pause_count    ?? 2
  );
  // AQS deviation: filler(50%) + pause(50%)
  const aqsDev_pct = round2(
    0.50 * fillerDev.deviation_pct +
    0.50 * pauseDev.deviation_pct
  );

  // ── Eye contact deviation ─────────────────────────────────
  const eyeDev = computeDeviationScore(
    session_values.gaze_ratio ?? 0.75,
    ey.baseline_gaze_ratio    ?? 0.75
  );

  // ── Generate alerts ───────────────────────────────────────
  const alerts = [];
  if (emotionDev.alert)
    alerts.push({
      type:    "emotion",
      message: `Emotion deviated ${emotionDev.deviation_pct}% from baseline`,
      severity: emotionDev.deviation_pct > 60 ? "high" : "medium"
    });
  if (voiceAlert)
    alerts.push({
      type:    "voice",
      message: `Voice deviated ${voiceDev_pct}% from baseline`,
      severity: voiceDev_pct > 60 ? "high" : "medium"
    });
  if (aqsDev_pct > ALERT_THRESHOLD_PCT)
    alerts.push({
      type:    "speech",
      message: `Speech pattern deviated ${aqsDev_pct}% from baseline`,
      severity: aqsDev_pct > 60 ? "high" : "medium"
    });
  if (eyeDev.alert)
    alerts.push({
      type:    "eye",
      message: `Eye contact deviated ${eyeDev.deviation_pct}% from baseline`,
      severity: eyeDev.deviation_pct > 60 ? "high" : "medium"
    });

  return {
    // Per-component deviation percentages (for dashboard charts)
    emotion_dev_pct: emotionDev.deviation_pct,
    voice_dev_pct:   voiceDev_pct,
    aqs_dev_pct:     aqsDev_pct,
    eye_dev_pct:     eyeDev.deviation_pct,

    // Detailed breakdown (for research / logging)
    detail: {
      emotion: emotionDev,
      pitch:   pitchDev,
      energy:  energyDev,
      wpm:     wpmDev,
      filler:  fillerDev,
      pause:   pauseDev,
      eye:     eyeDev
    },

    // Alerts (sent to frontend in real-time)
    alerts,
    has_alert: alerts.length > 0
  };
};


// ════════════════════════════════════════════════════════════
// SECTION 4 — SUGGESTION ENGINE
// ════════════════════════════════════════════════════════════

/**
 * generateSessionSuggestions
 * -----------------------------------------------------------------
 * Produces 3–5 actionable, prioritized suggestions based on the
 * session's weakest areas and highest deviations.
 *
 * @param  {Object} sessionScores  — output of computeSessionCIS
 * @returns {Array}                — sorted suggestions (most critical first)
 */
const generateSessionSuggestions = (sessionScores) => {
  const suggestions = [];
  const {
    ECS_avg, VSS_avg, AQS_avg, ECS2_avg,
    emotion_dev_avg, voice_dev_avg, aqs_dev_avg, eye_dev_avg,
    trajectory, weakest_component, worst_dev_area
  } = sessionScores;

  // ── Component-based suggestions ───────────────────────────
  if (ECS_avg < 0.55)
    suggestions.push({
      priority: 3,
      area:     "emotion",
      text:     "Practice projecting confidence — your facial expressions showed " +
                "lower confidence than your baseline. Try power posing before interviews."
    });

  if (VSS_avg < 0.55)
    suggestions.push({
      priority: 3,
      area:     "voice",
      text:     "Work on vocal stability. Slow breathing exercises before speaking " +
                "can reduce pitch variation and nervousness signals."
    });

  if (AQS_avg < 0.55)
    suggestions.push({
      priority: 3,
      area:     "answer",
      text:     "Structure answers using the STAR method " +
                "(Situation → Task → Action → Result) to improve relevance and depth."
    });

  if (ECS2_avg < 0.55)
    suggestions.push({
      priority: 2,
      area:     "eye",
      text:     "Maintain more eye contact with the camera. " +
                "Practice looking at the lens, not the screen."
    });

  // ── Deviation-based suggestions ───────────────────────────
  if (emotion_dev_avg > ALERT_THRESHOLD_PCT)
    suggestions.push({
      priority: 4,
      area:     "emotion_dev",
      text:     `Your emotion score deviated ${Math.round(emotion_dev_avg)}% from ` +
                "your baseline. The gap usually widens on harder questions — " +
                "practice with difficult behavioral questions."
    });

  if (voice_dev_avg > ALERT_THRESHOLD_PCT)
    suggestions.push({
      priority: 4,
      area:     "voice_dev",
      text:     `Your voice deviated ${Math.round(voice_dev_avg)}% from your baseline. ` +
                "This often happens when you rush. Pause before answering — " +
                "silence is better than filler words."
    });

  if (aqs_dev_avg > ALERT_THRESHOLD_PCT)
    suggestions.push({
      priority: 3,
      area:     "answer_dev",
      text:     `Your speech patterns shifted ${Math.round(aqs_dev_avg)}% from ` +
                "baseline. Prepare bullet-point answers for common questions " +
                "to maintain natural delivery."
    });

  // ── Trajectory suggestion ─────────────────────────────────
  if (trajectory === "degrading")
    suggestions.push({
      priority: 5,
      area:     "stamina",
      text:     "Your scores declined in the second half of the interview. " +
                "Practice sustaining concentration — do mock interviews with " +
                "increasing duration."
    });
  else if (trajectory === "improving")
    suggestions.push({
      priority: 1,
      area:     "warmup",
      text:     "Great — you improved as the interview progressed! " +
                "Your warm-up period is ~3 questions. Try to start stronger " +
                "by doing a 2-minute speaking exercise beforehand."
    });

  // Sort by priority descending (highest priority first)
  return suggestions
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 5)
    .map(s => s.text);
};


// ════════════════════════════════════════════════════════════
// SECTION 5 — COMPARISON: GENERIC vs PERSONALIZED
// ════════════════════════════════════════════════════════════

/**
 * compareGenericVsPersonalized
 * -----------------------------------------------------------------
 * Demonstrates the research contribution by computing the SAME
 * session scores two ways:
 *   1. Generic scoring  — compares to population mean thresholds
 *   2. Personalized     — compares to user's own baseline (PMCIS)
 *
 * Used in the IEEE paper results section.
 *
 * @param  {Object} session_values  — raw session feature values
 * @param  {Object} baseline        — user's personal baseline
 * @param  {Object} population_means— generic norms (hardcoded averages)
 * @returns {Object}               — { generic, personalized, difference }
 */
const compareGenericVsPersonalized = (
  session_values,
  baseline,
  population_means = {
    ECS: 0.65, VSS: 0.60, AQS: 0.55, ECS2: 0.70,
    pitch: 155, energy: 0.06, wpm: 135, filler_rate: 6
  }
) => {
  // ── Generic scoring (compare to population mean) ──────────
  const genericECS  = clamp(1 - computeDeviationScore(
    session_values.ECS_raw, population_means.ECS).deviation);
  const genericVSS  = clamp(1 - computeDeviationScore(
    session_values.VSS_raw, population_means.VSS).deviation);
  const genericAQS  = clamp(1 - computeDeviationScore(
    session_values.AQS, population_means.AQS).deviation);
  const genericECS2 = clamp(1 - computeDeviationScore(
    session_values.gaze_ratio, population_means.ECS2).deviation);

  const generic_CIS = round4(
    WEIGHTS.ECS  * genericECS  +
    WEIGHTS.VSS  * genericVSS  +
    WEIGHTS.AQS  * genericAQS  +
    WEIGHTS.ECS2 * genericECS2
  );

  // ── Personalized scoring (compare to user baseline) ───────
  const em = baseline.emotion || {};
  const vo = baseline.voice   || {};
  const ey = baseline.eye     || {};

  const persECS  = clamp(1 - computeDeviationScore(
    session_values.ECS_raw, em.baseline_ECS  || 0.7).deviation);
  const persVSS  = clamp(1 - computeDeviationScore(
    session_values.VSS_raw, vo.baseline_VSS  || 0.65).deviation);
  const persAQS  = session_values.AQS; // AQS already uses baseline internally
  const persECS2 = clamp(1 - computeDeviationScore(
    session_values.gaze_ratio, ey.baseline_gaze_ratio || 0.75).deviation);

  const personalized_CIS = round4(
    WEIGHTS.ECS  * persECS  +
    WEIGHTS.VSS  * persVSS  +
    WEIGHTS.AQS  * persAQS  +
    WEIGHTS.ECS2 * persECS2
  );

  const difference = round4(Math.abs(personalized_CIS - generic_CIS));
  const fairer     = personalized_CIS > generic_CIS
    ? "Personalized scoring is more favorable — user performs well vs their own norm"
    : "Generic scoring happens to favor this user — but personalized is still more accurate";

  return {
    generic: {
      CIS: generic_CIS, ECS: genericECS, VSS: genericVSS,
      AQS: genericAQS,  ECS2: genericECS2,
      grade: getGradeInfo(generic_CIS).grade
    },
    personalized: {
      CIS: personalized_CIS, ECS: persECS, VSS: persVSS,
      AQS: persAQS,          ECS2: persECS2,
      grade: getGradeInfo(personalized_CIS).grade
    },
    difference,
    fairer_assessment: fairer
  };
};


// ════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════

const clamp  = (v) => Math.min(Math.max(parseFloat(v) || 0, 0.0), 1.0);
const round4 = (v) => parseFloat(v.toFixed(4));
const round2 = (v) => parseFloat(v.toFixed(2));

const getGradeInfo = (cis) =>
  GRADE_THRESHOLDS.find(t => cis >= t.min) || GRADE_THRESHOLDS.at(-1);

const _emptySessionScores = () => ({
  CIS_overall:0, ECS_avg:0, VSS_avg:0, AQS_avg:0, ECS2_avg:0,
  emotion_dev_avg:0, voice_dev_avg:0, aqs_dev_avg:0, eye_dev_avg:0,
  trajectory:"stable", weakest_component:"AQS", worst_dev_area:"emotion",
  grade:"F", grade_label:"Poor", color:"#fc8181", question_count:0
});


// ════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════

module.exports = {
  computeQuestionCIS,
  computeSessionCIS,
  computeDeviationScore,
  computeAllDeviations,
  generateSessionSuggestions,
  compareGenericVsPersonalized,
  getGradeInfo,
  WEIGHTS,
  ALERT_THRESHOLD_PCT
};
