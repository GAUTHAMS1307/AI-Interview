import React from "react";
import { useTheme } from "../../context/ThemeContext";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--border-color)",
        color: "var(--text-secondary)",
        padding: "7px 12px",
        borderRadius: 8,
        fontSize: 13,
        cursor: "pointer"
      }}
      aria-label="Toggle light mode"
    >
      {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
    </button>
  );
}
