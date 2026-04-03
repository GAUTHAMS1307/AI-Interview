// src/components/Calibration/CalibrationScreen.jsx
import React, { useRef, useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  startWebcam, stopWebcam, captureFrame, AudioRecorder, attachStreamToVideo, checkCameraAvailable
} from "../../services/mediaService";
import { apiSaveBaseline } from "../../services/api";
import styles from "./Calibration.module.css";

const DURATION_SEC  = 90;
const FRAME_INTERVAL = 2000;   // capture frame every 2 seconds

export default function CalibrationScreen() {
  const navigate      = useNavigate();
  const videoRef      = useRef(null);
  const streamRef     = useRef(null);
  const recorderRef   = useRef(new AudioRecorder());
  const frameTimerRef = useRef(null);

  const [phase,     setPhase]     = useState("intro");    // intro | recording | processing | done
  const [timeLeft,  setTimeLeft]  = useState(DURATION_SEC);
  const [frames,    setFrames]    = useState([]);
  const [audioSegs, setAudioSegs] = useState([]);
  const [error,     setError]     = useState("");
  const [tip,       setTip]       = useState(0);
  const [checkingDevices, setCheckingDevices] = useState(false);

  const TIPS = [
    "Speak naturally about your day or introduce yourself",
    "Look directly at the camera — this measures your natural gaze",
    "Use your normal speaking pace — no need to slow down",
    "Relax your face — this captures your neutral expression baseline",
    "You're almost done! Keep speaking naturally"
  ];

  // Capture frame every FRAME_INTERVAL ms
  const captureLoop = useCallback(() => {
    frameTimerRef.current = setInterval(() => {
      const b64 = captureFrame(videoRef.current);
      if (b64) setFrames(prev => [...prev, b64]);
    }, FRAME_INTERVAL);
  }, []);

  const startCalibration = async () => {
    try {
      setError("");

      // Check if browser supports camera at all
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError("Your browser does not support camera access. Please use Chrome or Firefox.");
        return;
      }

      const stream = await startWebcam(videoRef.current);
      streamRef.current = stream;
      await recorderRef.current.start(stream);
      setPhase("recording");
      captureLoop();

      // Countdown timer
      let remaining = DURATION_SEC;
      const countdown = setInterval(() => {
        remaining -= 1;
        setTimeLeft(remaining);
        setTip(Math.floor((DURATION_SEC - remaining) / 18));  // rotate tips
        if (remaining <= 0) {
          clearInterval(countdown);
          finishCalibration();
        }
      }, 1000);
    } catch (err) {
      setError("Camera/microphone access denied. Please allow permissions.");
    }
  };

  const checkDevices = async () => {
    setCheckingDevices(true);
    try {
      const status = await checkCameraAvailable();
      if (!status.available) {
        setError(status.reason || "Camera not found. Please connect/enable your camera and microphone.");
        return;
      }
      if (!status.hasMic) {
        setError("Camera found, but microphone is missing or disabled. Please enable microphone access.");
        return;
      }
      setError("Camera and microphone detected. Click Start Calibration.");
    } catch {
      setError("Unable to verify devices. Please check browser permissions and retry.");
    } finally {
      setCheckingDevices(false);
    }
  };

  const finishCalibration = async () => {
    clearInterval(frameTimerRef.current);
    setPhase("processing");

    try {
      // Stop audio recording
      const audioB64 = await recorderRef.current.stop();

      // Stop webcam
      stopWebcam(streamRef.current);

      // Split audio into ~15s segments for baseline processing
      const segments = [audioB64];   // simplified: send as single segment

      // Send to backend
      await apiSaveBaseline({ frames, audio_segments: segments });

      setPhase("done");
    } catch (err) {
      setError("Failed to save baseline: " + (err.response?.data?.message || err.message));
      setPhase("intro");
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearInterval(frameTimerRef.current);
      stopWebcam(streamRef.current);
    };
  }, []);

  useEffect(() => {
    if (phase !== "recording") return;
    attachStreamToVideo(videoRef.current, streamRef.current);
  }, [phase]);

  const pct = Math.round(((DURATION_SEC - timeLeft) / DURATION_SEC) * 100);

  return (
    <div className={styles.page}>
      {/* ── INTRO ── */}
      {phase === "intro" && (
        <div className={styles.card}>
          <div className={styles.icon}>🎯</div>
          <h1>Baseline Calibration</h1>
          <p className={styles.desc}>
            Before your interview, we need to record <strong>90 seconds</strong>{" "}
            of your natural behavior. This creates your personal baseline so we
            can measure deviation — not compare you to generic standards.
          </p>
          <div className={styles.checklist}>
            {["Webcam access required","Microphone access required",
              "Speak naturally — no interview needed","Quiet environment recommended"
            ].map(item => (
              <div key={item} className={styles.checkItem}>
                <span className={styles.checkMark}>✓</span> {item}
              </div>
            ))}
          </div>
        {error && (
          <div className={styles.error}>
            <div style={{ fontWeight: 600, marginBottom: 8 }}>⚠️ Permission Error</div>
            <div style={{ fontSize: 12, lineHeight: 1.6 }}>{error}</div>
            <div style={{ marginTop: 12, padding: "10px 12px",
                          background: "#1a1d27", borderRadius: 8, fontSize: 12 }}>
              <div style={{ color: "#ecc94b", fontWeight: 600, marginBottom: 6 }}>
                🔧 Quick Fix for Chrome:
              </div>
              <div style={{ color: "#a0aec0", lineHeight: 1.8 }}>
                1. Click the 🔒 lock icon in the address bar<br/>
                2. Click <strong style={{color:"#e2e8f0"}}>Site settings</strong><br/>
                3. Set Camera → <strong style={{color:"#68d391"}}>Allow</strong><br/>
                4. Set Microphone → <strong style={{color:"#68d391"}}>Allow</strong><br/>
                5. Reload this page (Ctrl+R / Cmd+R)
              </div>
              <div style={{ color: "#ecc94b", fontWeight: 600, margin: "10px 0 6px" }}>
                🔧 Quick Fix for Firefox:
              </div>
              <div style={{ color: "#a0aec0", lineHeight: 1.8 }}>
                1. Click the camera icon (crossed out) in address bar<br/>
                2. Remove the blocked permission<br/>
                3. Reload and click Allow when prompted
              </div>
            </div>
          </div>
        )}
          <button className={styles.btn} onClick={startCalibration}>
            Start 90-Second Calibration
          </button>
          <button className={styles.btnSecondary} onClick={checkDevices} disabled={checkingDevices}>
            {checkingDevices ? "Checking..." : "Check Camera & Mic"}
          </button>
        </div>
      )}

      {/* ── RECORDING ── */}
      {phase === "recording" && (
        <div className={styles.recordingLayout}>
          <div className={styles.videoWrapper}>
            <video ref={videoRef} className={styles.video} muted autoPlay playsInline />
            <div className={styles.recDot} />
            <div className={styles.recLabel}>RECORDING</div>
          </div>

          <div className={styles.sidebar}>
            <h2>Calibration in Progress</h2>

            {/* Circular progress */}
            <div className={styles.timerRing}>
              <svg width="120" height="120" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r="50" fill="none"
                  stroke="#2d3148" strokeWidth="8" />
                <circle cx="60" cy="60" r="50" fill="none"
                  stroke="#4f46e5" strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 50}`}
                  strokeDashoffset={`${2 * Math.PI * 50 * (1 - pct / 100)}`}
                  transform="rotate(-90 60 60)"
                  style={{ transition: "stroke-dashoffset 1s linear" }}
                />
              </svg>
              <div className={styles.timerText}>
                <span className={styles.timerSec}>{timeLeft}</span>
                <span className={styles.timerLabel}>seconds left</span>
              </div>
            </div>

            {/* Tip */}
            <div className={styles.tip}>
              💡 {TIPS[Math.min(tip, TIPS.length - 1)]}
            </div>

            {/* What's being captured */}
            <div className={styles.capturing}>
              <div className={styles.capItem}><span>😊</span> Facial expressions</div>
              <div className={styles.capItem}><span>👁️</span> Eye gaze pattern</div>
              <div className={styles.capItem}><span>🎤</span> Voice pitch & pace</div>
              <div className={styles.capItem}><span>📝</span> Speech patterns</div>
            </div>

            <div className={styles.frameCount}>
              {frames.length} frames captured
            </div>
          </div>
        </div>
      )}

      {/* ── PROCESSING ── */}
      {phase === "processing" && (
        <div className={styles.card}>
          <div className={styles.spinner} />
          <h2>Analyzing your baseline...</h2>
          <p>Our AI models are extracting your personal behavioral features.
             This takes about 15–20 seconds.</p>
          <div className={styles.processingSteps}>
            {["Extracting emotion patterns","Analyzing voice features",
              "Computing eye contact baseline","Saving your profile"
            ].map((s, i) => (
              <div key={s} className={styles.stepRow}>
                <div className={styles.stepDot}
                  style={{ animationDelay: `${i * 0.5}s` }} />
                {s}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── DONE ── */}
      {phase === "done" && (
        <div className={styles.card}>
          <div className={styles.successIcon}>✅</div>
          <h1>Baseline Saved!</h1>
          <p className={styles.desc}>
            Your personal behavioral profile has been created. All future
            interview scores will be measured against <em>your</em> baseline,
            not generic population averages.
          </p>
          <div className={styles.baselineSummary}>
            <div className={styles.bItem}><span>😊</span> Emotion baseline captured</div>
            <div className={styles.bItem}><span>🎤</span> Voice baseline captured</div>
            <div className={styles.bItem}><span>👁️</span> Eye contact baseline captured</div>
            <div className={styles.bItem}><span>📝</span> Speech baseline captured</div>
          </div>
          <div className={styles.btnRow}>
            <button className={styles.btnSecondary} onClick={() => navigate("/dashboard")}>
              Go to Dashboard
            </button>
            <button className={styles.btn} onClick={() => navigate("/interview")}>
              Start Interview →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
