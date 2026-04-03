// src/index.js
import React from "react";
import ReactDOM from "react-dom/client";
import axios from "axios";
import App from "./App";

const API_URL = (process.env.REACT_APP_API_URL || "").trim().replace(/\/$/, "");
if (API_URL) {
  axios.defaults.baseURL = API_URL;
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
