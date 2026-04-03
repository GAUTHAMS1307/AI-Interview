// ============================================================
// app.js  —  PMCIS Backend Entry Point
// Run: node app.js
// ============================================================
const express    = require("express");
const cors       = require("cors");
const helmet     = require("helmet");
const morgan     = require("morgan");
const http       = require("http");
const socketio   = require("socket.io");
require("dotenv").config();

const connectDB  = require("./config/db");
const { analyzeEmotionFrame, analyzeVoiceChunk } = require("./services/aiProvider");

// ── Route imports ────────────────────────────────────────────
const authRoutes        = require("./routes/auth");
const calibrationRoutes = require("./routes/calibration");
const sessionRoutes     = require("./routes/session");
const reportRoutes      = require("./routes/report");

const app    = express();
const server = http.createServer(app);

const normalizeOrigin = (value = "") => {
  const input = String(value).trim();
  if (!input) return "";

  try {
    const url = new URL(input);
    const protocol = url.protocol.toLowerCase();
    const hostname = url.hostname.toLowerCase();
    const port = url.port || "";
    const defaultPort =
      (protocol === "http:" && port === "80") ||
      (protocol === "https:" && port === "443");
    const normalizedPort = !port || defaultPort ? "" : `:${port}`;
    return `${protocol}//${hostname}${normalizedPort}`;
  } catch {
    const fallback = input.replace(/\/+$/, "").toLowerCase();
    return /^https?:\/\/[^/]+$/i.test(fallback) ? fallback : "";
  }
};

const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:3000")
  .split(",")
  .map((o) => normalizeOrigin(o))
  .filter(Boolean);
const allowedOriginsSet = new Set(allowedOrigins);

const corsOrigin = (origin, callback) => {
  if (!origin) return callback(null, true);
  if (allowedOriginsSet.has(normalizeOrigin(origin))) return callback(null, true);
  return callback(new Error("Not allowed by CORS"));
};

// ── Socket.io setup (real-time frame streaming) ──────────────
const io = socketio(server, {
  cors: { origin: corsOrigin,
           methods: ["GET", "POST"] }
});

// Attach io to app so controllers can access it
app.set("io", io);

// ── Middleware ────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: "50mb" }));   // large for base64 frames
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(morgan("dev"));

// ── Database ──────────────────────────────────────────────────
connectDB();

// ── Routes ───────────────────────────────────────────────────
app.use("/api/auth",        authRoutes);
app.use("/api/calibration", calibrationRoutes);
app.use("/api/session",     sessionRoutes);
app.use("/api/report",      reportRoutes);

// ── Health check ─────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Socket.io real-time events ────────────────────────────────
io.on("connection", (socket) => {
  console.log(`[Socket] Client connected: ${socket.id}`);

  // Frontend sends webcam frame → forward to ML server
  socket.on("frame", async (data) => {
    try {
      const response = await analyzeEmotionFrame({
        frame: data.frame,
        baseline_ecs: data.baseline_ecs
      });

      // Emit results back to this client only
      socket.emit("emotion_result", response);
    } catch (err) {
      socket.emit("ml_error", { error: err.message });
    }
  });

  // Audio chunk streaming
  socket.on("audio_chunk", async (data) => {
    try {
      const response = await analyzeVoiceChunk({
        audio: data.audio,
        baseline: data.baseline
      });

      socket.emit("voice_result", response);
    } catch (err) {
      socket.emit("ml_error", { error: err.message });
    }
  });

  socket.on("disconnect", () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

// ── Start server ─────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`[Server] Running on http://localhost:${PORT}`);
  console.log(`[AI]     Provider mode: ${process.env.OPENAI_API_KEY ? "OpenAI API enabled" : "fallback (no OPENAI_API_KEY)"}`);
});

module.exports = app;
