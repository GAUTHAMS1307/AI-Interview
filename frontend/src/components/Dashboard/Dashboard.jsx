// src/components/Dashboard/Dashboard.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import ThemeToggle from "../Common/ThemeToggle";
import { apiGetSessions, apiGetProgress, apiGetBaseline } from "../../services/api";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, RadialLinearScale, ArcElement,
  Filler, Tooltip, Legend
} from "chart.js";
import { Line, Radar, Bar } from "react-chartjs-2";
import styles from "./Dashboard.module.css";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, RadialLinearScale, ArcElement, Filler, Tooltip, Legend);

export default function Dashboard() {
  const { user, logout }   = useAuth();
  const navigate           = useNavigate();
  const [sessions,   setSessions]   = useState([]);
  const [progress,   setProgress]   = useState(null);
  const [baseline,   setBaseline]   = useState(null);
  const [loading,    setLoading]    = useState(true);

  useEffect(() => {
    (async () => {
      // Sessions and progress — run together
      try {
        const [sRes, pRes] = await Promise.all([
          apiGetSessions(), apiGetProgress()
        ]);
        setSessions(sRes.data.sessions || []);
        setProgress(pRes.data);
      } catch (err) {
        console.error("[Dashboard] sessions/progress error:", err.message);
      }

      // Baseline — 200 with calibrated:false if not done yet
      try {
        const bRes = await apiGetBaseline();
        // calibrated:false means user hasnt done calibration yet
        if (bRes.data.calibrated === false) {
          setBaseline(null);
        } else {
          setBaseline(bRes.data.baseline);
        }
      } catch (err) {
        console.error("[Dashboard] baseline error:", err.message);
        setBaseline(null);
      }

      setLoading(false);
    })();
  }, []);

  const latest = sessions[0];
  const cisScore = latest ? Math.round(latest.scores.CIS_overall * 100) : null;

  // ── Chart: CIS progress over sessions ────────────────────────
  const progressChart = progress?.history?.length ? {
    labels: progress.history.map((h, i) => `Session ${h.session_num}`),
    datasets: [{
      label: "CIS Score",
      data:  progress.history.map(h => Math.round(h.CIS * 100)),
      borderColor: "#4f46e5",
      backgroundColor: "rgba(79,70,229,0.1)",
      tension: 0.4, fill: true, pointRadius: 5,
      pointBackgroundColor: "#4f46e5"
    }]
  } : null;

  // ── Chart: latest session component breakdown (Radar) ────────
  const radarChart = latest ? {
    labels: ["Emotion", "Voice", "Answer Quality", "Eye Contact"],
    datasets: [{
      label: "Latest Session",
      data: [
        Math.round(latest.scores.ECS_avg * 100),
        Math.round(latest.scores.VSS_avg * 100),
        Math.round(latest.scores.AQS_avg * 100),
        Math.round(latest.scores.ECS2_avg * 100)
      ],
      backgroundColor: "rgba(79,70,229,0.2)",
      borderColor: "#4f46e5",
      pointBackgroundColor: "#818cf8"
    }]
  } : null;

  const chartOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: "#a0aec0", font: { size: 12 } } } },
    scales: {
      x: { ticks: { color: "#718096" }, grid: { color: "#2d3148" } },
      y: { min: 0, max: 100, ticks: { color: "#718096" }, grid: { color: "#2d3148" } }
    }
  };

  const radarOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: "#a0aec0" } } },
    scales: {
      r: {
        min: 0, max: 100,
        ticks: { color: "#718096", backdropColor: "transparent", stepSize: 25 },
        grid: { color: "#2d3148" },
        pointLabels: { color: "#a0aec0", font: { size: 12 } }
      }
    }
  };

  if (loading) return <div className={styles.loading}>Loading dashboard...</div>;

  return (
    <div className={styles.page}>
      {/* ── Navbar ── */}
      <nav className={styles.nav}>
        <div className={styles.navBrand}>🎯 PMCIS</div>
        <div className={styles.navLinks}>
          <ThemeToggle />
          <button onClick={() => navigate("/calibration")}>Recalibrate</button>
          <button className={styles.navPrimary}
            onClick={() => navigate("/interview")}>
            New Interview
          </button>
          <span className={styles.navUser}>{user?.name}</span>
          <button className={styles.navLogout} onClick={logout}>Logout</button>
        </div>
      </nav>

      <div className={styles.content}>
        <h1 className={styles.pageTitle}>Dashboard</h1>
        <p className={styles.pageSub}>
          {progress?.trend === "improving" ? "📈 You're improving across sessions!" :
           progress?.trend === "declining" ? "📉 Focus needed — scores are declining." :
           "Your personalized interview performance overview."}
        </p>

        {/* ── Top KPI cards ── */}
        <div className={styles.kpiRow}>
          <KPICard
            label="Latest CIS Score"
            value={cisScore != null ? `${cisScore}` : "--"}
            unit="%"
            grade={latest?.scores ? getGrade(latest.scores.CIS_overall) : null}
            color="#4f46e5"
          />
          <KPICard
            label="Total Sessions"
            value={progress?.total_sessions || 0}
            color="#4299e1"
          />
          <KPICard
            label="Best CIS"
            value={progress?.history?.length
              ? Math.round(Math.max(...progress.history.map(h=>h.CIS)) * 100)
              : "--"}
            unit="%"
            color="#48bb78"
          />
          <KPICard
            label="Trend"
            value={progress?.trend === "improving" ? "↑ Up"
                 : progress?.trend === "declining" ? "↓ Down" : "→ Stable"}
            color={progress?.trend === "improving" ? "#48bb78"
                 : progress?.trend === "declining" ? "#fc8181" : "#ecc94b"}
          />
        </div>

        {/* ── No baseline warning ── */}
        {!baseline && (
          <div className={styles.warningBanner}>
            ⚠️ No baseline found.{" "}
            <button onClick={() => navigate("/calibration")}>
              Run Calibration first →
            </button>
          </div>
        )}

        {/* ── Charts ── */}
        {(progressChart || radarChart) && (
          <div className={styles.chartsRow}>
            {progressChart && (
              <div className={styles.chartCard}>
                <h3>CIS Progress Over Sessions</h3>
                <div className={styles.chartArea}>
                  <Line data={progressChart} options={chartOpts} />
                </div>
              </div>
            )}
            {radarChart && (
              <div className={styles.chartCard}>
                <h3>Latest Session Breakdown</h3>
                <div className={styles.chartArea}>
                  <Radar data={radarChart} options={radarOpts} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Session history ── */}
        <div className={styles.historyCard}>
          <h3>Session History</h3>
          {sessions.length === 0 ? (
            <div className={styles.empty}>
              No sessions yet.{" "}
              <button onClick={() => navigate("/interview")}>
                Start your first interview →
              </button>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Date</th><th>Role</th>
                  <th>CIS</th><th>Emotion</th>
                  <th>Voice</th><th>AQS</th><th>Eye</th>
                  <th>Grade</th><th></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s, i) => (
                  <tr key={i}>
                    <td>{new Date(s.startedAt).toLocaleDateString()}</td>
                    <td><span className={styles.role}>{s.role}</span></td>
                    <td className={styles.cisCell}>
                      {Math.round(s.scores.CIS_overall * 100)}%
                    </td>
                    <td>{Math.round(s.scores.ECS_avg * 100)}%</td>
                    <td>{Math.round(s.scores.VSS_avg * 100)}%</td>
                    <td>{Math.round(s.scores.AQS_avg * 100)}%</td>
                    <td>{Math.round(s.scores.ECS2_avg * 100)}%</td>
                    <td>
                      <span className={`${styles.grade} ${styles[`grade${getGrade(s.scores.CIS_overall)}`]}`}>
                        {getGrade(s.scores.CIS_overall)}
                      </span>
                    </td>
                    <td>
                      <button className={styles.viewBtn}
                        onClick={() => navigate(`/report/${s._id}`)}>
                        View →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ── KPI Card subcomponent ─────────────────────────────────────
function KPICard({ label, value, unit="", grade, color }) {
  return (
    <div className={styles.kpiCard}>
      <div className={styles.kpiLabel}>{label}</div>
      <div className={styles.kpiValue} style={{ color }}>
        {value}{unit}
        {grade && <span className={styles.kpiGrade}>{grade}</span>}
      </div>
    </div>
  );
}

const getGrade = (cis) => {
  if (cis >= 0.85) return "A";
  if (cis >= 0.70) return "B";
  if (cis >= 0.55) return "C";
  if (cis >= 0.40) return "D";
  return "F";
};
