// src/components/Dashboard/SessionReport.jsx
import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiGetReport, apiGetLastFiveComparison } from "../../services/api";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  PointElement, LineElement, Tooltip, Legend
} from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import styles from "./Dashboard.module.css";

ChartJS.register(CategoryScale, LinearScale, BarElement,
  PointElement, LineElement, Tooltip, Legend);
const compareFeatureEnabled =
  String(process.env.REACT_APP_FEATURE_REPORT_COMPARE || "false").toLowerCase() === "true";
const pdfFeatureEnabled =
  String(process.env.REACT_APP_FEATURE_REPORT_PDF || "false").toLowerCase() === "true";

export default function SessionReport() {
  const { id }         = useParams();
  const navigate       = useNavigate();
  const [report, setReport] = useState(null);
  const [comparison, setComparison] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]  = useState("overview");  // overview | questions | deviation

  useEffect(() => {
    (async () => {
      try {
        const reportRes = await apiGetReport(id);
        setReport(reportRes.data);
      } catch {}

      if (compareFeatureEnabled) {
        try {
          const comparisonRes = await apiGetLastFiveComparison();
          setComparison(comparisonRes?.data?.comparison || []);
        } catch {}
      }

      setLoading(false);
    })();
  }, [id]);

  if (loading) return <div className={styles.loading}>Loading report...</div>;
  if (!report)  return <div className={styles.loading}>Report not found.</div>;

  const { scores, deviation_timeline: dt, question_details: qs,
          top_suggestions, worst_area, duration_min } = report;

  // ── CIS per question bar chart ────────────────────────────────
  const cisChart = {
    labels: dt.map(q => `Q${q.question_num}`),
    datasets: [{
      label: "CIS",
      data:  dt.map(q => Math.round((q.CIS||0) * 100)),
      backgroundColor: dt.map(q =>
        q.CIS >= 0.70 ? "rgba(72,187,120,0.7)"
        : q.CIS >= 0.50 ? "rgba(236,201,75,0.7)"
        : "rgba(252,129,129,0.7)"
      ),
      borderRadius: 6
    }]
  };

  // ── Deviation per question line chart ─────────────────────────
  const devChart = {
    labels: dt.map(q => `Q${q.question_num}`),
    datasets: [
      { label: "Emotion Dev %",  data: dt.map(q => q.emotion_dev_pct || 0),
        borderColor:"#fc8181", tension:0.4, pointRadius:4 },
      { label: "Voice Dev %",    data: dt.map(q => q.voice_dev_pct   || 0),
        borderColor:"#4299e1", tension:0.4, pointRadius:4 },
      { label: "Answer Dev %",   data: dt.map(q => q.aqs_dev_pct     || 0),
        borderColor:"#48bb78", tension:0.4, pointRadius:4 },
      { label: "Eye Dev %",      data: dt.map(q => q.eye_dev_pct     || 0),
        borderColor:"#ecc94b", tension:0.4, pointRadius:4 },
      { label: "35% Alert",      data: dt.map(() => 35),
        borderColor:"rgba(252,129,129,0.4)", borderDash:[6,4],
        pointRadius:0, tension:0 }
    ]
  };

  const chartOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color:"#a0aec0", font:{ size:11 } } } },
    scales: {
      x: { ticks:{ color:"#718096" }, grid:{ color:"#2d3148" } },
      y: { min:0, max:100, ticks:{ color:"#718096" }, grid:{ color:"#2d3148" } }
    }
  };
  const comparisonChart = {
    labels: comparison.map((s) =>
      `${new Date(s.date).toLocaleDateString()} (${s.role || "role"})`
    ),
    datasets: [{
      label: "CIS (Last 5)",
      data: comparison.map((s) => Math.round((s.CIS || 0) * 100)),
      borderColor: "#4f46e5",
      backgroundColor: "rgba(79,70,229,0.12)",
      tension: 0.35,
      fill: true,
      pointRadius: 4
    }]
  };

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <div className={styles.navBrand}>🎯 PMCIS</div>
        <button className={styles.backBtn} onClick={() => navigate("/dashboard")}>
          ← Dashboard
        </button>
      </nav>

      <div className={styles.content}>
        <div className={styles.reportHeader}>
          <div>
            <h1 className={styles.pageTitle}>Session Report</h1>
            <p className={styles.pageSub}>
              {new Date(report.completedAt).toLocaleDateString()} ·
              {report.role} · {duration_min} min
            </p>
          </div>
          <div className={styles.headerRight}>
            {pdfFeatureEnabled && (
              <button className={styles.printBtn} onClick={() => window.print()}>
                Download PDF
              </button>
            )}
            <div className={styles.bigCIS}>
              <div className={styles.bigScore}>
                {Math.round(scores.CIS_overall * 100)}
              </div>
              <div className={styles.bigGrade}>{getGrade(scores.CIS_overall)}</div>
              <div className={styles.bigLabel}>CIS Score</div>
            </div>
          </div>
        </div>

        {/* ── Component scores ── */}
        <div className={styles.kpiRow}>
          {[
            { label:"Emotion",      val: scores.ECS_avg,  avg: scores.emotion_dev_avg, color:"#818cf8" },
            { label:"Voice",        val: scores.VSS_avg,  avg: scores.voice_dev_avg,   color:"#4299e1" },
            { label:"Answer Quality", val: scores.AQS_avg, avg: scores.aqs_dev_avg,    color:"#48bb78" },
            { label:"Eye Contact",  val: scores.ECS2_avg, avg: scores.eye_dev_avg,     color:"#ecc94b" }
          ].map(({ label, val, avg, color }) => (
            <div key={label} className={styles.kpiCard}>
              <div className={styles.kpiLabel}>{label}</div>
              <div className={styles.kpiValue} style={{ color }}>
                {Math.round((val||0) * 100)}%
              </div>
              <div className={styles.kpiDev}>
                Δ {Math.round(avg||0)}% from baseline
                {avg > 35 && <span className={styles.alertTag}>⚠ High</span>}
              </div>
            </div>
          ))}
        </div>

        {/* ── Tabs ── */}
        <div className={styles.tabs}>
          {["overview","questions","deviation"].map(t => (
            <button key={t}
              className={`${styles.tab} ${tab === t ? styles.tabActive : ""}`}
              onClick={() => setTab(t)}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>

        {/* ── Overview tab ── */}
        {tab === "overview" && (
          <>
            <div className={styles.chartCard}>
              <h3>CIS Score Per Question</h3>
              <div className={styles.chartArea} style={{ height:220 }}>
                <Bar data={cisChart} options={chartOpts} />
              </div>
            </div>
            {top_suggestions?.length > 0 && (
              <div className={styles.suggestCard}>
                <h3>🧠 Top Suggestions</h3>
                {top_suggestions.map((s, i) => (
                  <div key={i} className={styles.suggestion}>
                    <span className={styles.sugNum}>{i+1}</span> {s}
                  </div>
                ))}
              </div>
            )}
            {compareFeatureEnabled && comparison.length > 0 && (
              <div className={styles.chartCard}>
                <h3>Last 5 Session Comparison</h3>
                <div className={styles.chartArea} style={{ height:220 }}>
                  <Line data={comparisonChart} options={chartOpts} />
                </div>
              </div>
            )}
          </>
        )}

        {/* ── Deviation tab ── */}
        {tab === "deviation" && (
          <div className={styles.chartCard}>
            <h3>Deviation from Baseline (%) Per Question</h3>
            <p className={styles.chartSub}>
              Dashed red line = 35% alert threshold.
              Peaks above it triggered real-time alerts.
            </p>
            <div className={styles.chartArea} style={{ height:280 }}>
              <Line data={devChart} options={chartOpts} />
            </div>
          </div>
        )}

        {/* ── Questions tab ── */}
        {tab === "questions" && (
          <div className={styles.questionsList}>
            {qs.map((q, i) => (
              <div key={i} className={styles.qCard}>
                <div className={styles.qHeader}>
                  <span className={styles.qNum}>Q{i+1}</span>
                  <span className={styles.qCat}>{q.category}</span>
                  <span className={styles.qCIS}>
                    CIS: {Math.round((q.CIS||0)*100)}%
                  </span>
                </div>
                <p className={styles.qText}>{q.questionText}</p>
                {q.transcript && (
                  <div className={styles.transcript}>
                    <strong>Your answer:</strong> {q.transcript.slice(0,300)}
                    {q.transcript.length > 300 ? "..." : ""}
                  </div>
                )}
                <div className={styles.qScores}>
                  {[
                    ["Emotion", q.ECS, q.emotion_dev_pct],
                    ["Voice",   q.VSS, q.voice_dev_pct],
                    ["Answer",  q.AQS, q.aqs_dev_pct],
                    ["Eye",     q.ECS2,q.eye_dev_pct]
                  ].map(([label, val, dev]) => (
                    <div key={label} className={styles.miniScore}>
                      <span>{label}</span>
                      <strong>{Math.round((val||0)*100)}%</strong>
                      <span className={dev > 35 ? styles.devHigh : styles.devOk}>
                        Δ{Math.round(dev||0)}%
                      </span>
                    </div>
                  ))}
                </div>
                {q.suggestions?.length > 0 && (
                  <div className={styles.qSuggestions}>
                    {q.suggestions.map((s, j) => (
                      <div key={j} className={styles.qSug}>💡 {s}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
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
