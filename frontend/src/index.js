// src/index.js
import React from "react";
import ReactDOM from "react-dom/client";
import axios from "axios";
import App from "./App";

const normalizeApiBaseUrl = (rawUrl) => {
  const trimmed = (rawUrl || "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";

  return trimmed.replace(/(?:\/api)?\/health$/i, "");
};

const API_URL = normalizeApiBaseUrl(process.env.REACT_APP_API_URL);
if (API_URL) {
  axios.defaults.baseURL = API_URL;
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
