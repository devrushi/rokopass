import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ApiError } from "../lib/apiClient";
import "./AuthForm.css";

// Dev-only quick logins for manual testing — the accounts are seeded by prisma/seed.ts
// (seedDemoAccounts/seedAdmin). import.meta.env.DEV is false in a production build, so this
// section (and the credentials below) never ships.
const QUICK_LOGINS = [
  { label: "Parent", email: "demo.parent@rokidspass.local", password: "DemoParent123" },
  { label: "Activity Provider", email: "demo.provider@rokidspass.local", password: "DemoProvider123" },
  { label: "Admin", email: "admin@rokidspass.local", password: "AdminPassword123" },
];

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quickLoginBusy, setQuickLoginBusy] = useState<string | null>(null);

  async function doLogin(loginEmail: string, loginPassword: string) {
    setError(null);
    try {
      await login(loginEmail, loginPassword);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    await doLogin(email, password);
    setIsSubmitting(false);
  }

  async function handleQuickLogin(quickLogin: (typeof QUICK_LOGINS)[number]) {
    setQuickLoginBusy(quickLogin.label);
    await doLogin(quickLogin.email, quickLogin.password);
    setQuickLoginBusy(null);
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <h1>Log in</h1>

      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </label>

      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>

      {error && <p className="auth-form__error">{error}</p>}

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Logging in…" : "Log in"}
      </button>

      <p className="auth-form__footer">
        No account? <Link to="/register">Sign up</Link>
      </p>

      {import.meta.env.DEV && (
        <div className="auth-form__quick-logins">
          <p className="auth-form__quick-logins-label">Quick login (dev only)</p>
          <div className="auth-form__quick-logins-row">
            {QUICK_LOGINS.map((quickLogin) => (
              <button
                key={quickLogin.label}
                type="button"
                className="button button--secondary"
                disabled={quickLoginBusy !== null}
                onClick={() => handleQuickLogin(quickLogin)}
              >
                {quickLoginBusy === quickLogin.label ? "Logging in…" : quickLogin.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </form>
  );
}
