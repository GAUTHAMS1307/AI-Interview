// src/components/Auth/Register.jsx
import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import styles from "./Auth.module.css";
import ThemeToggle from "../Common/ThemeToggle";

export default function Register() {
  const { register } = useAuth();
  const navigate     = useNavigate();
  const [form, setForm]   = useState({ name:"", email:"", password:"" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      await register(form.name, form.email, form.password);
      navigate("/calibration");   // new users go straight to calibration
    } catch (err) {
      setError(err.response?.data?.message || "Registration failed");
    } finally { setLoading(false); }
  };

  return (
    <div className={styles.page}>
      <div className={styles.themeToggleWrap}>
        <ThemeToggle />
      </div>
      <div className={styles.card}>
        <div className={styles.logo}>🎯 PMCIS</div>
        <h1 className={styles.title}>Create account</h1>
        <p className={styles.sub}>Start your personalized interview training</p>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={submit} className={styles.form}>
          <div className={styles.field}>
            <label>Full Name</label>
            <input name="name" type="text" value={form.name}
              onChange={handle} placeholder="John Doe" required />
          </div>
          <div className={styles.field}>
            <label>Email</label>
            <input name="email" type="email" value={form.email}
              onChange={handle} placeholder="you@email.com" required />
          </div>
          <div className={styles.field}>
            <label>Password</label>
            <input name="password" type="password" value={form.password}
              onChange={handle} placeholder="Min 6 characters" minLength={6} required />
          </div>
          <button type="submit" className={styles.btn} disabled={loading}>
            {loading ? "Creating..." : "Create Account"}
          </button>
        </form>

        <p className={styles.link}>
          Have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
