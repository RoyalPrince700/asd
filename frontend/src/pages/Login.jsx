import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";

export function Login() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) {
    return <Navigate to="/" replace />;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-panel">
        <p className="eyebrow">Accessible Stock Dashboard</p>
        <h1>Stock control for the finance office.</h1>
        <p className="lede">
          Clerks post daily movement. CFO watches balances, net flow, and
          downloads the pack.
        </p>

        <form onSubmit={onSubmit} className="login-form">
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            Password
            <div className="password-field">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((open) => !open)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>
          {error ? <p className="alert">{error}</p> : null}
          <button type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Enter dashboard"}
          </button>
        </form>

        <p className="auth-switch">
          No account yet? <Link to="/signup">Create account</Link>
        </p>
      </section>
      <aside className="login-aside">
        <blockquote>
          Closing balance is always opening plus inbound and stock received,
          minus outbound and stock out.
        </blockquote>
        <ul>
          <li>Opening balance</li>
          <li>In / out</li>
          <li>Stock received / stock out</li>
          <li>Excel and Word packs for the board</li>
        </ul>
      </aside>
    </div>
  );
}
