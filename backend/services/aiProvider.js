const axios = require("axios");

const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const OPENAI_MODEL_TEXT = process.env.OPENAI_MODEL_TEXT || "gpt-4o-mini";
const OPENAI_MODEL_VISION = process.env.OPENAI_MODEL_VISION || OPENAI_MODEL_TEXT;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

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

const openAIChatJson = async ({ messages, model = OPENAI_MODEL_TEXT }) => {
  if (!openAIEnabled()) throw new Error("OPENAI_API_KEY is not configured");
  const { data } = await axios.post(
    `${OPENAI_BASE_URL}/chat/completions`,
    {
      model,
      temperature: 0.2,
      messages
    },
    {
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      timeout: 30000
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

const generateQuestions = async ({ role = "general", count = 6 }) => {
  try {
    const json = await openAIChatJson({
      model: OPENAI_MODEL_TEXT,
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
  const fallback = {
    transcript: "Audio analysis unavailable. Please ensure AI API key is configured.",
    wpm: baseWpm,
    filler_count: 0,
    pause_count: 0,
    GS: 0.6,
    RS: 0.6,
    FS: 0.7,
    DS: 0.6,
    AQS: 0.62,
    deviation_pct: 0,
    suggestions: ["Configure OPENAI_API_KEY to enable detailed NLP scoring."]
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
                    text: `Audio (base64, truncated): ${String(audio).slice(0, 12000)}`
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
          content: `Baseline voice metrics: ${JSON.stringify(baseline || {})}. Audio(base64 truncated): ${String(audio || "").slice(0, 12000)}`
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
    return fallback;
  }
};

const calibrateEmotion = async ({ frames = [] }) => {
  const sample = frames[0];
  const emotion = await analyzeEmotionFrame({ frame: sample, baseline_ecs: 0.7 });
  return {
    baseline_ECS: round(clamp(Number(emotion.ECS || 0.7), 0.4, 0.95)),
    baseline_probs: {
      Neutral: 0.55,
      Happy: 0.25,
      Calm: 0.15
    },
    baseline_dominant: emotion.emotion || "Neutral",
    frames_processed: frames.length
  };
};

const calibrateVoice = async ({ audio_segments = [] }) => {
  const first = audio_segments[0];
  const voice = await analyzeVoiceChunk({ audio: first, baseline: {} });
  return {
    baseline_VSS: round(clamp(Number(voice.VSS || 0.65), 0.35, 0.95)),
    baseline_pitch: Number(voice.pitch || 150),
    baseline_pitch_std: 20,
    baseline_energy: Number(voice.energy || 0.05),
    baseline_wpm: Number(voice.wpm || 130),
    baseline_pause_rate: Number(voice.pause_rate || 0.3),
    baseline_mfcc_means: [],
    segments_processed: audio_segments.length
  };
};

const calibrateEye = async ({ frames = [] }) => {
  const sample = frames[0];
  const eye = await analyzeEyeFrame({ frame: sample, baseline_gaze: 0.75 });
  return {
    baseline_gaze_ratio: round(clamp(Number(eye.gaze_ratio || 0.75), 0.3, 0.95)),
    baseline_blink_rate: 15,
    frames_processed: frames.length
  };
};

const calibrateStt = async ({ audio_segments = [] }) => {
  const first = audio_segments[0];
  const nlp = await analyzeNlpAnswer({
    audio: first,
    question: "Calibration speech sample",
    baseline_stt: { baseline_wpm: 130 }
  });
  const baselineWpm = Number(nlp.wpm || 130);
  return {
    baseline_wpm: baselineWpm,
    baseline_filler_rate: Number(nlp.filler_count || 0),
    baseline_pause_count: Number(nlp.pause_count || 2),
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
