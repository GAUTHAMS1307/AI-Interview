// src/components/Common/Navbar.jsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate         = useNavigate();

  return (
    <nav style={{
      display:        "flex",
      alignItems:     "center",
      justifyContent: "space-between",
      padding:        "14px 32px",
      background:     "#1e2130",
      borderBottom:   "1px solid #2d3148",
      position:       "sticky",
      top:            0,
      zIndex:         10
    }}>
      {/* Brand */}
      <div
        onClick={() => navigate("/dashboard")}
        style={{ fontSize:18, fontWeight:700, color:"#e2e8f0", cursor:"pointer" }}
      >
        🎯 PMCIS
      </div>

      {/* Links */}
      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
        <NavBtn onClick={() => navigate("/dashboard")}>Dashboard</NavBtn>
        <NavBtn onClick={() => navigate("/calibration")}>Recalibrate</NavBtn>
        <NavBtn
          onClick={() => navigate("/interview")}
          primary
        >
          New Interview
        </NavBtn>
        <span style={{ color:"#718096", fontSize:13 }}>{user?.name}</span>
        <NavBtn onClick={logout} danger>Logout</NavBtn>
      </div>
    </nav>
  );
}

function NavBtn({ children, onClick, primary, danger }) {
  return (
    <button
      onClick={onClick}
      style={{
        background:   primary ? "#4f46e5" : "none",
        border:       `1px solid ${primary ? "#4f46e5" : danger ? "#4a2020" : "#3d4166"}`,
        color:        primary ? "#fff" : danger ? "#fc8181" : "#a0aec0",
        padding:      "7px 14px",
        borderRadius: 8,
        fontSize:     13,
        cursor:       "pointer"
      }}
    >
      {children}
    </button>
  );
}
