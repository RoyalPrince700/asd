import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

export function SetPasswordForm({ busy, onSave }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  if (!open) {
    return (
      <button
        type="button"
        className="text-btn"
        disabled={busy}
        onClick={() => setOpen(true)}
      >
        Set password
      </button>
    );
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    try {
      await onSave(password);
      setPassword("");
      setConfirm("");
      setShowPassword(false);
      setOpen(false);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="inline-password" onSubmit={submit}>
      <label>
        New password
        <div className="password-field">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={6}
            required
            disabled={busy}
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </label>
      <label>
        Confirm password
        <input
          type={showPassword ? "text" : "password"}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          minLength={6}
          required
          disabled={busy}
        />
      </label>
      {error ? <p className="alert">{error}</p> : null}
      <div className="actions">
        <button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="ghost"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setPassword("");
            setConfirm("");
            setError("");
          }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
