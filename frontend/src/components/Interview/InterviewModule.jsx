// src/components/Interview/InterviewModule.jsx
import React, { useRef, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { io } from "socket.io-client";
import {
  startWebcam, stopWebcam, captureFrame, AudioRecorder, attachStreamToVideo, checkCameraAvailable
} from "../../services/mediaService";
import {
  apiStartSession, apiSaveQuestion, apiCompleteSession, apiGetBaseline
} from "../../services/api";
import styles from "./Interview.module.css";

const FRAME_RATE_MS   = 1500;   // emit frame every 1.5s during interview
const ANSWER_TIME_SEC = 120;    // 2 min max per question
const SOCKET_URL = (process.env.REACT_APP_SOCKET_URL || "").trim();

export default function InterviewModule() {
  const navigate      = useNavigate();
  const videoRef      = useRef(null);
  const streamRef     = useRef(null);
  const socketRef     = useRef(null);
  const recorderRef   = useRef(new AudioRecorder());
  const frameTimerRef = useRef(null);

  // Session state
  const [phase,       setPhase]       = useState("setup");  // setup|question|processing|done
  const [sessionId,   setSessionId]   = useState(null);
  const [questions,   setQuestions]   = useState([]);
  const [currentQ,    setCurrentQ]    = useState(0);
  const [baseline,    setBaseline]    = useState(null);
  const [role,        setRole]        = useState("software_engineer");

  // Live scores (updated by socket events)
  const [liveEmotion, setLiveEmotion] = useState(null);
  const [liveVoice,   setLiveVoice]   = useState(null);

  // Answer timer
  const [timeLeft, setTimeLeft] = useState(ANSWER_TIME_SEC);
  const timerRef  = useRef(null);

  // Accumulated scores per question
  const scoresRef = useRef({ ECS:[], VSS:[], ECS2:[], emotion_dev:[], voice_dev:[], eye_dev:[] });

  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [checkingDevices, setCheckingDevices] = useState(false);

  // ── Setup phase: start session ──────────────────────────────
  const beginSession = async () => {
    try {
      setError("");
      setStatusMessage("");
      // Get baseline
      const bRes = await apiGetBaseline();
      setBaseline(bRes.data.baseline);

      // Start webcam
      const stream = await startWebcam(videoRef.current);
      streamRef.current = stream;

      // Start session on backend
      const sRes = await apiStartSession({ role, count: 6 });
      setSessionId(sRes.data.sessionId);
      setQuestions(sRes.data.questions);

      // Connect socket.io
      socketRef.current = SOCKET_URL ? io(SOCKET_URL) : io();
      socketRef.current.on("emotion_result", (data) => {
        setLiveEmotion(data);
        if (data.ECS != null)       scoresRef.current.ECS.push(data.ECS);
        if (data.deviation_pct != null) scoresRef.current.emotion_dev.push(data.deviation_pct);
      });
      socketRef.current.on("voice_result", (data) => {
        setLiveVoice(data);
        if (data.VSS != null)       scoresRef.current.VSS.push(data.VSS);
        if (data.deviation_pct != null) scoresRef.current.voice_dev.push(data.deviation_pct);
      });

      setPhase("question");
      startQuestion(0, sRes.data.baseline);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    }
  };

  const checkDevices = async () => {
    setCheckingDevices(true);
    setStatusMessage("");
    try {
      const status = await checkCameraAvailable();
      if (!status.available) {
        setError(status.reason || "Camera not found. Please connect/enable your camera.");
        return;
      }
      if (!status.hasMic) {
        setError("Camera found, but microphone is missing or disabled.");
        return;
      }
      setError("");
      setStatusMessage("Camera and microphone detected. You can begin the interview.");
    } catch {
      setError("Unable to verify devices. Please check browser permission settings.");
    } finally {
      setCheckingDevices(false);
    }
  };

  // ── Start a question: begin recording + timer + frame loop ──
  const startQuestion = useCallback((idx, bl) => {
    scoresRef.current = { ECS:[], VSS:[], ECS2:[], emotion_dev:[], voice_dev:[], eye_dev:[] };
    setCurrentQ(idx);
    setTimeLeft(ANSWER_TIME_SEC);

    // Record audio for this answer
    recorderRef.current.start(streamRef.current);

    // Frame capture + socket emit loop
    frameTimerRef.current = setInterval(() => {
      const frame = captureFrame(videoRef.current);
      if (frame && socketRef.current) {
        socketRef.current.emit("frame", {
          frame,
          baseline_ecs: bl?.emotion?.baseline_ECS || 0.70
        });
      }
    }, FRAME_RATE_MS);

    // Countdown timer
    let remaining = ANSWER_TIME_SEC;
    timerRef.current = setInterval(() => {
      remaining -= 1;
      setTimeLeft(remaining);
      if (remaining <= 0) submitAnswer();
    }, 1000);
  }, []);

  // ── Submit current answer ────────────────────────────────────
  const submitAnswer = useCallback(async () => {
    clearInterval(frameTimerRef.current);
    clearInterval(timerRef.current);
    setPhase("processing");
    setSaving(true);

    try {
      // Stop audio, get base64
      const audioB64 = await recorderRef.current.stop();

      // Call backend proxy endpoint for NLP + Eye scoring
      const axios = (await import("axios")).default;
      const q = questions[currentQ];
      const analysisRes = await axios.post("/api/session/analyze", {
        audio:       audioB64,
        frame:       captureFrame(videoRef.current),
        question:    q.text,
        baseline_stt: baseline?.stt,
        baseline_gaze: baseline?.eye?.baseline_gaze_ratio || 0.75
      });
      const { nlp, eye: eyeData } = analysisRes.data;

      // Average accumulated live scores
      const avg = (arr) => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0.5;
      const ECS  = avg(scoresRef.current.ECS);
      const VSS  = avg(scoresRef.current.VSS);
      const ECS2 = eyeData.ECS2 || 0.7;
      const AQS  = nlp.AQS || 0.5;

      // Save to backend
      await apiSaveQuestion(sessionId, {
        questionId: q.id, questionText: q.text,
        category: q.category, difficulty: q.difficulty,
        ECS, VSS, AQS, ECS2,
        emotion_dev_pct: avg(scoresRef.current.emotion_dev),
        voice_dev_pct:   avg(scoresRef.current.voice_dev),
        aqs_dev_pct:     nlp.deviation_pct || 0,
        eye_dev_pct:     eyeData.deviation_pct || 0,
        transcript: nlp.transcript, wpm: nlp.wpm,
        filler_count: nlp.filler_count, pause_count: nlp.pause_count,
        GS: nlp.GS, RS: nlp.RS, FS: nlp.FS, DS: nlp.DS,
        dominant_emotion: liveEmotion?.emotion || "Unknown",
        suggestions: nlp.suggestions || [],
        duration_sec: ANSWER_TIME_SEC - timeLeft
      });

      // Next question or finish
      const nextIdx = currentQ + 1;
      if (nextIdx < questions.length) {
        setPhase("question");
        startQuestion(nextIdx, baseline);
      } else {
        await finishSession();
      }
    } catch (err) {
      setError("Error saving answer: " + err.message);
      setPhase("question");
    } finally {
      setSaving(false);
    }
  }, [currentQ, questions, sessionId, baseline, liveEmotion, timeLeft, startQuestion]);

  // ── Finish session ───────────────────────────────────────────
  const finishSession = async () => {
    try {
      await apiCompleteSession(sessionId);
      stopWebcam(streamRef.current);
      socketRef.current?.disconnect();
      setPhase("done");
    } catch (err) {
      setError("Error completing session: " + err.message);
    }
  };

  // Cleanup
  useEffect(() => {
    return () => {
      clearInterval(frameTimerRef.current);
      clearInterval(timerRef.current);
      stopWebcam(streamRef.current);
      socketRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (phase !== "question") return;
    attachStreamToVideo(videoRef.current, streamRef.current);
  }, [phase, currentQ]);

  const progressPct = questions.length
    ? Math.round((currentQ / questions.length) * 100) : 0;

  return (
    <div className={styles.page}>

      {/* ── SETUP ── */}
      {phase === "setup" && (
        <div className={styles.setupCard}>
          <h1>🎤 Interview Session</h1>
          <p>Select your target role and start the interview.</p>
          {error && <div className={styles.error}>{error}</div>}
          {statusMessage && <div className={styles.success}>{statusMessage}</div>}
          <div className={styles.field}>
            <label>Target Role</label>
            <select value={role} onChange={e => setRole(e.target.value)}>
              <option value="software_engineer">Software Engineer</option>
              <option value="data_scientist">Data Scientist</option>
              <option value="product_manager">Product Manager</option>
              <option value="general">General</option>
            </select>
          </div>
          <div className={styles.infoBox}>
            <div>📹 Webcam + microphone will be used</div>
            <div>❓ 6 questions · ~12 minutes</div>
            <div>📊 Real-time CIS scoring</div>
            <div>🧠 Personalized deviation analysis</div>
          </div>
          {/* Hidden video for preview */}
          <video ref={videoRef} className={styles.hiddenVideo} muted autoPlay playsInline />
          <button className={styles.btn} onClick={beginSession}>
            Begin Interview
          </button>
          <button className={styles.btnSecondary} onClick={checkDevices} disabled={checkingDevices}>
            {checkingDevices ? "Checking..." : "Check Camera & Mic"}
          </button>
        </div>
      )}

      {/* ── QUESTION ── */}
      {phase === "question" && questions.length > 0 && (
        <div className={styles.interviewLayout}>
          {/* Left: webcam + live scores */}
          <div className={styles.leftPanel}>
            <div className={styles.videoBox}>
              <video ref={videoRef} className={styles.video} muted autoPlay playsInline />
              {liveEmotion?.face_found && (
                <div className={styles.emotionBadge}>
                  {liveEmotion.emotion}
                </div>
              )}
            </div>

            {/* Live score bars */}
            <div className={styles.liveScores}>
              <div className={styles.scoreLabel}>Live Confidence Scores</div>
              {[
                { label:"Emotion", val: liveEmotion?.ECS, dev: liveEmotion?.deviation_pct },
                { label:"Voice",   val: liveVoice?.VSS,   dev: liveVoice?.deviation_pct }
              ].map(({ label, val, dev }) => (
                <div key={label} className={styles.scoreRow}>
                  <span className={styles.sLabel}>{label}</span>
                  <div className={styles.bar}>
                    <div className={styles.barFill}
                      style={{ width: `${Math.round((val||0)*100)}%`,
                               background: val > 0.6 ? "#48bb78" : val > 0.4 ? "#ecc94b" : "#fc8181" }} />
                  </div>
                  <span className={styles.sVal}>{val != null ? Math.round(val*100) : "--"}</span>
                  {dev > 35 && <span className={styles.alert}>⚠</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Right: question + timer */}
          <div className={styles.rightPanel}>
            {/* Progress */}
            <div className={styles.progress}>
              <span className={styles.progressLabel}>
                Question {currentQ + 1} of {questions.length}
              </span>
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{ width: `${progressPct}%` }} />
              </div>
            </div>

            {/* Category badge */}
            <div className={styles.catBadge}>
              {questions[currentQ]?.category?.toUpperCase()} ·
              {"★".repeat(questions[currentQ]?.difficulty || 1)}
            </div>

            {/* Question text */}
            <div className={styles.questionBox}>
              <p className={styles.questionText}>
                {questions[currentQ]?.text}
              </p>
            </div>

            {/* Timer */}
            <div className={styles.timer}>
              <div className={styles.timerBar}>
                <div className={styles.timerFill}
                  style={{
                    width: `${(timeLeft / ANSWER_TIME_SEC) * 100}%`,
                    background: timeLeft > 60 ? "#4f46e5"
                              : timeLeft > 30 ? "#ecc94b" : "#fc8181"
                  }} />
              </div>
              <span className={styles.timerText}>
                {Math.floor(timeLeft/60)}:{String(timeLeft%60).padStart(2,"0")} remaining
              </span>
            </div>

            <button
              className={styles.submitBtn}
              onClick={submitAnswer}
              disabled={saving}
            >
              {saving ? "Saving..." : "Submit Answer →"}
            </button>
          </div>
        </div>
      )}

      {/* ── PROCESSING ── */}
      {phase === "processing" && (
        <div className={styles.processingCard}>
          <div className={styles.spinner} />
          <h2>Analyzing your answer...</h2>
          <p>Running NLP scoring, emotion analysis, and deviation calculation.</p>
        </div>
      )}

      {/* ── DONE ── */}
      {phase === "done" && (
        <div className={styles.doneCard}>
          <div style={{ fontSize: 56 }}>🎉</div>
          <h1>Interview Complete!</h1>
          <p>All {questions.length} questions answered. Your CIS scores are ready.</p>
          <div className={styles.btnRow}>
            <button className={styles.btnSecondary}
              onClick={() => navigate("/dashboard")}>
              Dashboard
            </button>
            <button className={styles.btn}
              onClick={() => navigate(`/report/${sessionId}`)}>
              View Full Report →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
