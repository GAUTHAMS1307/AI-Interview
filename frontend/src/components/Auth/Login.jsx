// src/components/Auth/Login.jsx
import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import styles from "./Auth.module.css";

export default function Login() {
  const { login }   = useAuth();
  const navigate    = useNavigate();
  const [form, setForm]     = useState({ email: "", password: "" });
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);

  const handle = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      await login(form.email, form.password);
      navigate("/dashboard");
    } catch (err) {
      setError(err.response?.data?.message || "Login failed");
    } finally { setLoading(false); }
  };

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.logo}>🎯 PMCIS</div>
        <h1 className={styles.title}>Welcome back</h1>
        <p className={styles.sub}>Sign in to your interview trainer</p>

        {error && <div className={styles.error}>{error}</div>}

        <form onSubmit={submit} className={styles.form}>
          <div className={styles.field}>
            <label>Email</label>
            <input name="email" type="email" value={form.email}
              onChange={handle} placeholder="you@email.com" required />
          </div>
          <div className={styles.field}>
            <label>Password</label>
            <input name="password" type="password" value={form.password}
              onChange={handle} placeholder="••••••••" required />
          </div>
          <button type="submit" className={styles.btn} disabled={loading}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p className={styles.link}>
          No account? <Link to="/register">Register here</Link>
        </p>
      </div>
    </div>
  );
}
