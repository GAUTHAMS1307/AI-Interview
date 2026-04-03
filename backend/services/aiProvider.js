const axios = require("axios");

const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const OPENAI_MODEL_TEXT = process.env.OPENAI_MODEL_TEXT || "gpt-4o-mini";
const OPENAI_MODEL_VISION = process.env.OPENAI_MODEL_VISION || OPENAI_MODEL_TEXT;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS || 45000);
const OPENAI_TEMPERATURE = Number(process.env.OPENAI_TEMPERATURE || 0.2);

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
const round = (n, d = 3) => Number(Number(n || 0).toFixed(d));

const extractJsonObject = (raw) => {
  if (!raw || typeof raw !== "string") return null;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
};

const openAIEnabled = () => Boolean(OPENAI_API_KEY.trim());

const openAIChatJson = async ({ messages, model = OPENAI_MODEL_TEXT, temperature = OPENAI_TEMPERATURE }) => {
  if (!openAIEnabled()) throw new Error("OPENAI_API_KEY is not configured");
  if (!isHttpsUrl(OPENAI_BASE_URL)) {
    throw new Error("OPENAI_BASE_URL must be HTTPS");
  }
  const { data } = await axios.post(
    `${OPENAI_BASE_URL}/chat/completions`,
    {
      model,
      temperature,
      messages
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      timeout: OPENAI_TIMEOUT_MS
    }
  );

  const content = data?.choices?.[0]?.message?.content;
  const parsed = extractJsonObject(content);
  if (!parsed) throw new Error("Invalid JSON response from AI provider");
  return parsed;
};

const defaultQuestions = (role = "general", count = 6) => {
  const bank = {
    software_engineer: [
      "Explain a time you optimized system performance.",
      "How do you debug a production issue under pressure?",
      "Describe trade-offs between SQL and NoSQL for a feature.",
      "How would you design a scalable notification service?",
      "Tell me about a difficult code review and outcome.",
      "How do you ensure API backward compatibility?"
    ],
    data_scientist: [
      "Describe a project where data quality changed your model outcome.",
      "How do you choose metrics for imbalanced classification?",
      "Explain your process for feature engineering.",
      "How do you communicate model limitations to stakeholders?",
      "Tell me about handling data drift in production.",
      "How do you validate experiment reliability?"
    ],
    product_manager: [
      "How do you prioritize competing roadmap items?",
      "Describe a time you changed strategy based on user feedback.",
      "How do you define success metrics for a new feature?",
      "How do you handle disagreements between engineering and design?",
      "Tell me about a product launch that underperformed and why.",
      "How do you balance speed and quality?"
    ],
    general: [
      "Tell me about yourself.",
      "Describe a challenge and how you solved it.",
      "What is one skill you are currently improving?",
      "How do you handle feedback?",
      "Tell me about a team project you are proud of.",
      "Why are you interested in this role?"
    ]
  };
  const selected = bank[role] || bank.general;
  return selected.slice(0, Math.max(1, count)).map((text, idx) => ({
    id: `q_${idx + 1}`,
    text,
    category: role === "general" ? "behavioral" : "role_specific",
    difficulty: 1 + (idx % 3)
  }));
};

const suggestFromScores = (aqs = 0.5, wpm = 130, fillerCount = 0, pauseCount = 0) => {
  const tips = [];
  if (aqs < 0.55) tips.push("Use a clearer structure (Situation, Action, Result) in your answer.");
  if (wpm > 170) tips.push("Slow your speaking pace slightly to improve clarity.");
  if (wpm < 95) tips.push("Increase your pace a little to sound more confident.");
  if (fillerCount > 6) tips.push("Reduce filler words by pausing briefly before key points.");
  if (pauseCount > 10) tips.push("Keep pauses intentional and avoid long silent gaps.");
  if (!tips.length) tips.push("Good delivery overall—maintain this clarity and confidence.");
  return tips.slice(0, 3);
};

const pickSample = (arr = [], maxItems = 3) => {
  if (!Array.isArray(arr) || arr.length === 0) return [];
  if (arr.length <= maxItems) return arr;
  const step = Math.max(1, Math.floor(arr.length / maxItems));
  const sampled = [];
  for (let i = 0; i < arr.length && sampled.length < maxItems; i += step) {
    sampled.push(arr[i]);
  }
  return sampled;
};

const avgNumbers = (values = [], fallback = 0) => {
  const nums = values.map(Number).filter((n) => Number.isFinite(n));
  if (!nums.length) return fallback;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
};

const isHttpsUrl = (value = "") => {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const audioPromptSummary = (audio) => {
  const raw = String(audio || "");
  if (!raw) return "Audio: empty";
  const len = raw.length;
  const head = raw.slice(0, 1800);
  const tail = raw.slice(-1200);
  return [`Audio(base64) length=${len}`, "Head sample:", head, "Tail sample:", tail].join("\n");
};

const settledSuccessful = (results = []) =>
  results
    .filter((r) => r.status === "fulfilled" && r.value)
    .map((r) => r.value);

const generateQuestions = async ({ role = "general", count = 6 }) => {
  try {
    const json = await openAIChatJson({
      model: OPENAI_MODEL_TEXT,
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content:
            "You generate realistic interview questions. Return ONLY JSON with key 'questions' as an array of objects {id,text,category,difficulty}. difficulty must be 1-3."
        },
        {
          role: "user",
          content: `Role: ${role}. Count: ${count}.`
        }
      ]
    });
    const questions = Array.isArray(json.questions) ? json.questions : [];
    if (!questions.length) return { questions: defaultQuestions(role, count) };
    return {
      questions: questions.slice(0, count).map((q, idx) => ({
        id: String(q.id || `q_${idx + 1}`),
        text: String(q.text || defaultQuestions(role, count)[idx]?.text || "Tell me about yourself."),
        category: String(q.category || "behavioral"),
        difficulty: clamp(Number(q.difficulty) || 2, 1, 3)
      }))
    };
  } catch {
    return { questions: defaultQuestions(role, count) };
  }
};

const analyzeNlpAnswer = async ({ audio, question, baseline_stt }) => {
  const baseWpm = Number(baseline_stt?.baseline_wpm || 130);
  const keyConfigured = openAIEnabled();
  const fallback = {
    transcript: keyConfigured
      ? "Audio analysis unavailable due to provider error. Using fallback scoring."
      : "Audio analysis unavailable. Please ensure AI API key is configured.",
    wpm: baseWpm,
    filler_count: 0,
    pause_count: 0,
    GS: 0.6,
    RS: 0.6,
    FS: 0.7,
    DS: 0.6,
    AQS: 0.62,
    deviation_pct: 0,
    suggestions: keyConfigured
      ? ["AI provider was temporarily unavailable; retry the analysis."]
      : ["Configure OPENAI_API_KEY to enable detailed NLP scoring."]
  };

  try {
    const prompt = [
      "Analyze an interview answer and score communication quality.",
      "Return ONLY JSON with keys:",
      "transcript (string), wpm (number), filler_count (number), pause_count (number),",
      "GS, RS, FS, DS, AQS (all numbers 0-1), suggestions (array of short strings).",
      `Question asked: ${question || ""}`,
      `Speaker baseline WPM: ${baseWpm}.`,
      "If audio content is not fully usable, infer reasonably from available signal and still return complete JSON."
    ].join(" ");

    const json = await openAIChatJson({
      model: OPENAI_MODEL_TEXT,
      messages: [
        { role: "system", content: "You are an interview communication scoring engine. Output JSON only." },
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            ...(audio
                ? [
                    {
                      type: "text",
                      text: audioPromptSummary(audio)
                    }
                  ]
                : [])
          ]
        }
      ]
    });

    const wpm = Number(json.wpm ?? baseWpm);
    const fillerCount = Number(json.filler_count ?? 0);
    const pauseCount = Number(json.pause_count ?? 0);
    const AQS = clamp(Number(json.AQS ?? 0.62), 0, 1);
    const deviation = clamp(Math.abs(((wpm - baseWpm) / Math.max(baseWpm, 1)) * 100), 0, 100);

    return {
      transcript: String(json.transcript || ""),
      wpm: round(wpm, 1),
      filler_count: fillerCount,
      pause_count: pauseCount,
      GS: clamp(Number(json.GS ?? AQS), 0, 1),
      RS: clamp(Number(json.RS ?? AQS), 0, 1),
      FS: clamp(Number(json.FS ?? 0.7), 0, 1),
      DS: clamp(Number(json.DS ?? AQS), 0, 1),
      AQS,
      deviation_pct: round(deviation, 1),
      suggestions: Array.isArray(json.suggestions) ? json.suggestions.slice(0, 3).map(String) : suggestFromScores(AQS, wpm, fillerCount, pauseCount)
    };
  } catch {
    return fallback;
  }
};

const analyzeEmotionFrame = async ({ frame, baseline_ecs = 0.7 }) => {
  const neutral = {
    face_found: false,
    emotion: "Neutral",
    ECS: round(baseline_ecs, 3),
    deviation_pct: 0
  };
  if (!frame) return neutral;

  try {
    const json = await openAIChatJson({
      model: OPENAI_MODEL_VISION,
      messages: [
        {
          role: "system",
          content:
            "You estimate interview facial confidence from an image. Return ONLY JSON {face_found:boolean, emotion:string, ECS:number}. ECS must be 0-1."
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyze this webcam frame for face presence and interview confidence emotion." },
            { type: "image_url", image_url: { url: frame } }
          ]
        }
      ]
    });
    const ECS = clamp(Number(json.ECS ?? baseline_ecs), 0, 1);
    return {
      face_found: Boolean(json.face_found),
      emotion: String(json.emotion || "Neutral"),
      ECS: round(ECS),
      deviation_pct: round(clamp(Math.abs((ECS - baseline_ecs) * 100), 0, 100), 1)
    };
  } catch {
    return neutral;
  }
};

const analyzeEyeFrame = async ({ frame, baseline_gaze = 0.75 }) => {
  const fallback = {
    face_found: false,
    gaze_ratio: round(baseline_gaze),
    ECS2: round(baseline_gaze),
    deviation_pct: 0
  };
  if (!frame) return fallback;

  try {
    const json = await openAIChatJson({
      model: OPENAI_MODEL_VISION,
      messages: [
        {
          role: "system",
          content:
            "Estimate eye contact from a webcam frame. Return ONLY JSON {face_found:boolean,gaze_ratio:number,ECS2:number}. Scores are 0-1."
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Assess whether the person is looking near the camera and estimate gaze_ratio." },
            { type: "image_url", image_url: { url: frame } }
          ]
        }
      ]
    });
    const gazeRatio = clamp(Number(json.gaze_ratio ?? baseline_gaze), 0, 1);
    const ECS2 = clamp(Number(json.ECS2 ?? gazeRatio), 0, 1);
    return {
      face_found: Boolean(json.face_found),
      gaze_ratio: round(gazeRatio),
      ECS2: round(ECS2),
      deviation_pct: round(clamp(Math.abs((gazeRatio - baseline_gaze) * 100), 0, 100), 1)
    };
  } catch {
    return fallback;
  }
};

const analyzeVoiceChunk = async ({ audio, baseline }) => {
  const baseVss = Number(baseline?.baseline_VSS || 0.65);
  const keyConfigured = openAIEnabled();
  const basePitch = Number(baseline?.baseline_pitch || 150);
  const fallback = {
    VSS: round(baseVss),
    pitch: basePitch,
    energy: Number(baseline?.baseline_energy || 0.05),
    wpm: Number(baseline?.baseline_wpm || 130),
    pause_rate: Number(baseline?.baseline_pause_rate || 0.3),
    deviation_pct: 0
  };

  try {
    const json = await openAIChatJson({
      model: OPENAI_MODEL_TEXT,
      messages: [
        {
          role: "system",
          content:
            "Estimate voice stability metrics for interview audio. Return ONLY JSON {VSS:number,pitch:number,energy:number,wpm:number,pause_rate:number}. VSS must be 0-1."
        },
        {
          role: "user",
          content: `Baseline voice metrics: ${JSON.stringify(baseline || {})}\n${audioPromptSummary(audio)}`
        }
      ]
    });
    const VSS = clamp(Number(json.VSS ?? baseVss), 0, 1);
    return {
      VSS: round(VSS),
      pitch: Number(json.pitch ?? basePitch),
      energy: Number(json.energy ?? fallback.energy),
      wpm: Number(json.wpm ?? fallback.wpm),
      pause_rate: Number(json.pause_rate ?? fallback.pause_rate),
      deviation_pct: round(clamp(Math.abs((VSS - baseVss) * 100), 0, 100), 1)
    };
  } catch {
    return {
      ...fallback,
      note: keyConfigured ? "voice_fallback_provider_error" : "voice_fallback_missing_api_key"
    };
  }
};

const calibrateEmotion = async ({ frames = [] }) => {
  const samples = pickSample(frames, 3);
  const settled = await Promise.allSettled(
    samples.map((frame) => analyzeEmotionFrame({ frame, baseline_ecs: 0.7 }))
  );
  const results = settledSuccessful(settled);
  const ecsAvg = avgNumbers(results.map((r) => r.ECS), 0.7);
  const dominant = results.find((r) => r.face_found)?.emotion || "Neutral";
  return {
    baseline_ECS: round(clamp(Number(ecsAvg || 0.7), 0.4, 0.95)),
    baseline_probs: {
      Neutral: 0.55,
      Happy: 0.25,
      Calm: 0.15
    },
    baseline_dominant: dominant,
    frames_processed: frames.length
  };
};

const calibrateVoice = async ({ audio_segments = [] }) => {
  const samples = pickSample(audio_segments, 3);
  const settled = await Promise.allSettled(
    samples.map((audio) => analyzeVoiceChunk({ audio, baseline: {} }))
  );
  const results = settledSuccessful(settled);
  return {
    baseline_VSS: round(clamp(avgNumbers(results.map((r) => r.VSS), 0.65), 0.35, 0.95)),
    baseline_pitch: Number(avgNumbers(results.map((r) => r.pitch), 150)),
    baseline_pitch_std: 20,
    baseline_energy: Number(avgNumbers(results.map((r) => r.energy), 0.05)),
    baseline_wpm: Number(avgNumbers(results.map((r) => r.wpm), 130)),
    baseline_pause_rate: Number(avgNumbers(results.map((r) => r.pause_rate), 0.3)),
    baseline_mfcc_means: [],
    segments_processed: audio_segments.length
  };
};

const calibrateEye = async ({ frames = [] }) => {
  const samples = pickSample(frames, 3);
  const settled = await Promise.allSettled(
    samples.map((frame) => analyzeEyeFrame({ frame, baseline_gaze: 0.75 }))
  );
  const results = settledSuccessful(settled);
  return {
    baseline_gaze_ratio: round(clamp(avgNumbers(results.map((r) => r.gaze_ratio), 0.75), 0.3, 0.95)),
    baseline_blink_rate: 15,
    frames_processed: frames.length
  };
};

const calibrateStt = async ({ audio_segments = [] }) => {
  const samples = pickSample(audio_segments, 3);
  const settled = await Promise.allSettled(
    samples.map((audio) =>
      analyzeNlpAnswer({
        audio,
        question: "Calibration speech sample",
        baseline_stt: { baseline_wpm: 130 }
      })
    )
  );
  const results = settledSuccessful(settled);
  const baselineWpm = Number(avgNumbers(results.map((r) => r.wpm), 130));
  return {
    baseline_wpm: baselineWpm,
    baseline_filler_rate: Number(avgNumbers(results.map((r) => r.filler_count), 0)),
    baseline_pause_count: Number(avgNumbers(results.map((r) => r.pause_count), 2)),
    baseline_speech_ratio: 0.85,
    segments_processed: audio_segments.length
  };
};

module.exports = {
  openAIEnabled,
  generateQuestions,
  analyzeNlpAnswer,
  analyzeEmotionFrame,
  analyzeEyeFrame,
  analyzeVoiceChunk,
  calibrateEmotion,
  calibrateVoice,
  calibrateEye,
  calibrateStt
};
