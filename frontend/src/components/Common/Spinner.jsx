// src/components/Common/Spinner.jsx
import React from "react";

export default function Spinner({ message = "Loading..." }) {
  return (
    <div style={{
      display:        "flex",
      flexDirection:  "column",
      alignItems:     "center",
      justifyContent: "center",
      minHeight:      "100vh",
      background:     "#0f1117",
      gap:            16
    }}>
      <div style={{
        width:          40,
        height:         40,
        border:         "3px solid #2d3148",
        borderTopColor: "#4f46e5",
        borderRadius:   "50%",
        animation:      "spin 0.8s linear infinite"
      }} />
      <p style={{ color:"#718096", fontSize:14 }}>{message}</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
