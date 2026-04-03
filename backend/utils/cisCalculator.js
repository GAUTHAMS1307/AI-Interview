// utils/cisCalculator.js
// ============================================================
// CIS = w1·ECS + w2·VSS + w3·AQS + w4·ECS2
// All weights and deviation logic lives here.
// ============================================================

const WEIGHTS = {
  ECS:  0.30,   // Emotion Confidence Score
  VSS:  0.25,   // Voice Stability Score
  AQS:  0.30,   // Answer Quality Score
  ECS2: 0.15    // Eye Contact Score
};

/**
 * computeCIS
 * Computes the Confidence Intelligence Score for one question answer.
 *
 * @param {Object} scores  — { ECS, VSS, AQS, ECS2 }  all in [0, 1]
 * @returns {Object}       — { CIS, breakdown, grade }
 */
const computeCIS = (scores) => {
  const { ECS = 0, VSS = 0, AQS = 0, ECS2 = 0 } = scores;

  const CIS = parseFloat((
    WEIGHTS.ECS  * ECS  +
    WEIGHTS.VSS  * VSS  +
    WEIGHTS.AQS  * AQS  +
    WEIGHTS.ECS2 * ECS2
  ).toFixed(4));

  return {
    CIS,
    breakdown: {
      ECS:  parseFloat(ECS.toFixed(4)),
      VSS:  parseFloat(VSS.toFixed(4)),
      AQS:  parseFloat(AQS.toFixed(4)),
      ECS2: parseFloat(ECS2.toFixed(4))
    },
    weights: WEIGHTS,
    grade: getCISGrade(CIS)
  };
};

/**
 * computeSessionCIS
 * Averages all per-question scores to produce session-level metrics.
 *
 * @param {Array}  questionScores  — array of per-question score objects
 * @returns {Object}               — session-level scores + deviations
 */
const computeSessionCIS = (questionScores) => {
  if (!questionScores || questionScores.length === 0) {
    return { CIS_overall: 0, ECS_avg: 0, VSS_avg: 0, AQS_avg: 0, ECS2_avg: 0 };
  }

  const avg = (key) =>
    parseFloat(
      (questionScores.reduce((sum, q) => sum + (q[key] || 0), 0) /
        questionScores.length).toFixed(4)
    );

  const ECS_avg  = avg("ECS");
  const VSS_avg  = avg("VSS");
  const AQS_avg  = avg("AQS");
  const ECS2_avg = avg("ECS2");

  const CIS_overall = parseFloat((
    WEIGHTS.ECS  * ECS_avg  +
    WEIGHTS.VSS  * VSS_avg  +
    WEIGHTS.AQS  * AQS_avg  +
    WEIGHTS.ECS2 * ECS2_avg
  ).toFixed(4));

  return {
    CIS_overall,
    ECS_avg,
    VSS_avg,
    AQS_avg,
    ECS2_avg,
    grade:            getCISGrade(CIS_overall),
    emotion_dev_avg:  avg("emotion_dev_pct"),
    voice_dev_avg:    avg("voice_dev_pct"),
    aqs_dev_avg:      avg("aqs_dev_pct"),
    eye_dev_avg:      avg("eye_dev_pct")
  };
};

/**
 * computeDeviation
 * Generic deviation: |current – baseline| / baseline → capped at 1.0
 */
const computeDeviation = (current, baseline) => {
  if (!baseline || baseline === 0) return 0;
  const dev = Math.abs(current - baseline) / Math.abs(baseline);
  return parseFloat(Math.min(dev, 1.0).toFixed(4));
};

/**
 * getCISGrade
 * Maps CIS score to a letter grade for the dashboard.
 */
const getCISGrade = (cis) => {
  if (cis >= 0.85) return "A";
  if (cis >= 0.70) return "B";
  if (cis >= 0.55) return "C";
  if (cis >= 0.40) return "D";
  return "F";
};

module.exports = { computeCIS, computeSessionCIS, computeDeviation,
                   getCISGrade, WEIGHTS };
