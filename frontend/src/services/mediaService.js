// src/services/mediaService.js
// Handles webcam capture, audio recording, and base64 conversion

// ── Webcam: capture one frame as base64 JPEG ──────────────────
export const captureFrame = (videoEl) => {
  if (!videoEl) return null;
  const canvas = document.createElement("canvas");
  canvas.width  = videoEl.videoWidth  || 640;
  canvas.height = videoEl.videoHeight || 480;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(videoEl, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.7);   // base64 JPEG
};

// ── Start webcam stream ───────────────────────────────────────
// Tries multiple constraint levels — falls back to simplest if needed
export const attachStreamToVideo = async (videoEl, stream) => {
  if (!videoEl || !stream) return;
  videoEl.srcObject = stream;
  try {
    await videoEl.play();
  } catch (playErr) {
    console.warn("[mediaService] videoEl.play() failed:", playErr.message);
  }
};

export const startWebcam = async (videoEl) => {

  // List of constraints to try in order (most specific → most permissive)
  const constraintOptions = [
    // Option 1: ideal constraints
    { video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }, audio: true },
    // Option 2: basic video + audio
    { video: true, audio: true },
    // Option 3: video only (no audio — mic may be missing)
    { video: true, audio: false },
  ];

  let stream = null;
  let lastError = null;

  for (const constraints of constraintOptions) {
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      break;   // success — stop trying
    } catch (err) {
      lastError = err;
      console.warn("[mediaService] Constraint attempt failed:", constraints, err.message);
    }
  }

  if (!stream) {
    // Give a helpful error message based on error type
    if (lastError?.name === "NotAllowedError" || lastError?.name === "PermissionDeniedError") {
      throw new Error(
        "Camera/microphone permission denied.\n\n" +
        "Fix steps:\n" +
        "1. Click the camera icon in the browser address bar\n" +
        "2. Select 'Allow' for camera and microphone\n" +
        "3. Reload the page and try again\n\n" +
        "Or go to: chrome://settings/content/camera → Add localhost:3000"
      );
    }
    if (lastError?.name === "NotFoundError" || lastError?.name === "DevicesNotFoundError") {
      throw new Error(
        "No camera or microphone found.\n" +
        "Please connect a webcam and microphone, then try again."
      );
    }
    if (lastError?.name === "NotReadableError" || lastError?.name === "TrackStartError") {
      throw new Error(
        "Camera is already in use by another application.\n" +
        "Close any other apps using the camera (Zoom, Teams, etc.) and try again."
      );
    }
    throw new Error("Could not access camera: " + (lastError?.message || "Unknown error"));
  }

  if (stream.getAudioTracks().length === 0) {
    stopWebcam(stream);
    throw new Error("Microphone is required for interview voice scoring. Please enable microphone access.");
  }

  await attachStreamToVideo(videoEl, stream);

  return stream;
};

// ── Stop webcam stream ────────────────────────────────────────
export const stopWebcam = (stream) => {
  if (stream) stream.getTracks().forEach(t => t.stop());
};

// ── Check if camera is available (call before startWebcam) ────
export const checkCameraAvailable = async () => {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return { available: false, reason: "Browser does not support camera access" };
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    const hasCamera = devices.some(d => d.kind === "videoinput");
    const hasMic    = devices.some(d => d.kind === "audioinput");
    return { available: hasCamera, hasCamera, hasMic };
  } catch {
    return { available: false, reason: "Could not enumerate devices" };
  }
};

// ── Audio recorder: record N seconds → base64 ────────────────
export class AudioRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.chunks = [];
  }

  async start(stream, onChunk) {
    this.chunks = [];

    // Use audio-only track from the shared stream
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      console.warn("[AudioRecorder] No audio tracks found — recording video only");
      return;
    }

    const audioStream = new MediaStream(audioTracks);

    // Pick best supported mimeType
    const mimeTypes = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
      ""   // browser default
    ];
    const mimeType = mimeTypes.find(m => m === "" || MediaRecorder.isTypeSupported(m)) || "";

    try {
      this.mediaRecorder = new MediaRecorder(
        audioStream,
        mimeType ? { mimeType } : {}
      );
    } catch {
      this.mediaRecorder = new MediaRecorder(audioStream);
    }

    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.chunks.push(e.data);
        if (typeof onChunk === "function") {
          blobToBase64(e.data)
            .then((b64) => onChunk(b64))
            .catch(() => {});
        }
      }
    };

    this.mediaRecorder.start(100);   // collect in 100ms chunks
  }

  stop() {
    return new Promise((resolve) => {
      if (!this.mediaRecorder) {
        resolve("");
        return;
      }
      this.mediaRecorder.onstop = async () => {
        if (this.chunks.length === 0) {
          resolve("");
          return;
        }
        const mimeType = this.mediaRecorder.mimeType || "audio/webm";
        const blob = new Blob(this.chunks, { type: mimeType });
        const b64  = await blobToBase64(blob);
        resolve(b64);
      };
      if (this.mediaRecorder.state !== "inactive") {
        this.mediaRecorder.stop();
      } else {
        resolve("");
      }
    });
  }
}

// ── Helper: Blob → base64 string ─────────────────────────────
export const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
