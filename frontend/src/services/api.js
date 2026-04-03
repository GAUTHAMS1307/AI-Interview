// src/services/api.js
import axios from "axios";

const BASE = "/api";

// ── Auth ──────────────────────────────────────────────────────
export const apiRegister  = (d) => axios.post(`${BASE}/auth/register`, d);
export const apiLogin     = (d) => axios.post(`${BASE}/auth/login`, d);

// ── Calibration ───────────────────────────────────────────────
export const apiSaveBaseline = (d) => axios.post(`${BASE}/calibration/save`, d);
export const apiGetBaseline  = ()  => axios.get(`${BASE}/calibration/me`);

// ── Session ───────────────────────────────────────────────────
export const apiStartSession   = (d)  => axios.post(`${BASE}/session/start`, d);
export const apiSaveQuestion   = (id, d) => axios.post(`${BASE}/session/${id}/question`, d);
export const apiCompleteSession = (id)  => axios.put(`${BASE}/session/${id}/complete`);
export const apiGetSessions    = ()   => axios.get(`${BASE}/session/all`);
export const apiGetSession     = (id) => axios.get(`${BASE}/session/${id}`);

// ── Reports ───────────────────────────────────────────────────
export const apiGetReport   = (id) => axios.get(`${BASE}/report/${id}`);
export const apiGetProgress = ()   => axios.get(`${BASE}/report/progress/all`);
export const apiGetLastFiveComparison = () => axios.get(`${BASE}/report/compare/last5`);
