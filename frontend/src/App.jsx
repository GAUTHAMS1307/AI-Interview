// src/App.jsx
import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";

import Login          from "./components/Auth/Login";
import Register       from "./components/Auth/Register";
import Dashboard      from "./components/Dashboard/Dashboard";
import Calibration    from "./components/Calibration/CalibrationScreen";
import InterviewModule from "./components/Interview/InterviewModule";
import SessionReport  from "./components/Dashboard/SessionReport";

// Protected route wrapper
const Protected = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  return user ? children : <Navigate to="/login" replace />;
};

const Spinner = () => (
  <div style={{ display:"flex", justifyContent:"center",
                alignItems:"center", height:"100vh", background:"#0f1117" }}>
    <div style={{ width:40, height:40, border:"3px solid #4f46e5",
                  borderTop:"3px solid transparent", borderRadius:"50%",
                  animation:"spin 0.8s linear infinite" }} />
    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>
);

const AppRoutes = () => (
  <Routes>
    <Route path="/login"       element={<Login />} />
    <Route path="/register"    element={<Register />} />
    <Route path="/dashboard"   element={<Protected><Dashboard /></Protected>} />
    <Route path="/calibration" element={<Protected><Calibration /></Protected>} />
    <Route path="/interview"   element={<Protected><InterviewModule /></Protected>} />
    <Route path="/report/:id"  element={<Protected><SessionReport /></Protected>} />
    <Route path="*"            element={<Navigate to="/dashboard" replace />} />
  </Routes>
);

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
