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

// ── Route imports ────────────────────────────────────────────
const authRoutes        = require("./routes/auth");
const calibrationRoutes = require("./routes/calibration");
const sessionRoutes     = require("./routes/session");
const reportRoutes      = require("./routes/report");

const app    = express();
const server = http.createServer(app);

// ── Socket.io setup (real-time frame streaming) ──────────────
const io = socketio(server, {
  cors: { origin: process.env.FRONTEND_URL || "http://localhost:3000",
          methods: ["GET", "POST"] }
});

// Attach io to app so controllers can access it
app.set("io", io);

// ── Middleware ────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:3000" }));
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
      const axios = require("axios");
      const ML_URL = process.env.ML_SERVER_URL || "http://localhost:5001";

      // Send frame + baseline to Python Flask ML server
      const response = await axios.post(`${ML_URL}/api/ml/emotion`, {
        frame:        data.frame,        // base64 JPEG
        baseline_ecs: data.baseline_ecs  // from user's calibration
      });

      // Emit results back to this client only
      socket.emit("emotion_result", response.data);
    } catch (err) {
      socket.emit("ml_error", { error: err.message });
    }
  });

  // Audio chunk streaming
  socket.on("audio_chunk", async (data) => {
    try {
      const axios = require("axios");
      const ML_URL = process.env.ML_SERVER_URL || "http://localhost:5001";

      const response = await axios.post(`${ML_URL}/api/ml/voice`, {
        audio:    data.audio,     // base64 WAV buffer
        baseline: data.baseline   // user's voice baseline
      });

      socket.emit("voice_result", response.data);
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
  console.log(`[ML]     Flask ML server expected at ${process.env.ML_SERVER_URL || "http://localhost:5001"}`);
});

module.exports = app;
