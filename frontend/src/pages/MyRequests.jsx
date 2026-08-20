import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { RequestDetailsCell } from "../components/RequestDetailsCell.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { useDialog } from "../context/DialogContext.jsx";
import {
  REQUEST_TYPES,
  currentDateValue,
  currentTimeValue,
  formatRequestDateTime,
  requestStatusLabel,
  requestStatusPill,
  requestTypeLabel,
} from "../constants/requests";
import { roleLabel } from "../utils/role.js";

const emptyForm = () => ({
  request: "credit",
  details: "",
  date: currentDateValue(),
  time: currentTimeValue(),
});

export function MyRequests() {
  const { user } = useAuth();
  const { toast } = useDialog();
  const [form, setForm] = useState(emptyForm);
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [timeManual, setTimeManual] = useState(false);
  const timeManualRef = useRef(false);

  async function load() {
    const data = await api.requests();
    setRequests(data.requests);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    timeManualRef.current = timeManual;
  }, [timeManual]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (timeManualRef.current) return;
      setForm((prev) => ({ ...prev, time: currentTimeValue() }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  function setField(key, value) {
    if (key === "time") {
      setTimeManual(true);
    }
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function syncCurrentTime() {
    setTimeManual(false);
    setForm((prev) => ({
      ...prev,
      date: currentDateValue(),
      time: currentTimeValue(),
    }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.createRequest(form);
      setForm(emptyForm());
      setTimeManual(false);
      await load();
      toast({ message: "Request submitted to the CFO.", type: "success" });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const active = requests.filter(
    (item) => item.status === "pending" || item.status === "processing"
  );
  const completed = requests.filter((item) => item.status === "completed");

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">{roleLabel(user.role)}</p>
          <h1>Requests</h1>
          <p className="lede tight">
            Submit a request to the CFO with date and time. Time syncs to the current
            clock automatically and can be edited manually before submitting.
          </p>
        </div>
      </header>

      {error ? <p className="alert">{error}</p> : null}

      <form className="entry-card" onSubmit={onSubmit}>
        <div className="request-fields-row request-type-row">
          <label>
            Request
            <select
              value={form.request}
              onChange={(e) => setField("request", e.target.value)}
              required
            >
              {REQUEST_TYPES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <label className="request-details-field">
            Details
            <textarea
              value={form.details}
              onChange={(e) => setField("details", e.target.value)}
              placeholder="Add more information about this request…"
              rows={3}
            />
          </label>
        </div>

        <div className="request-fields-row">
          <label>
            Date
            <input
              type="date"
              value={form.date}
              onChange={(e) => setField("date", e.target.value)}
              required
            />
          </label>

          <label>
            Time
            <input
              type="time"
              value={form.time}
              onChange={(e) => setField("time", e.target.value)}
              required
            />
          </label>
        </div>

        <p className="hint request-time-note">
          {timeManual ? "Manual time selected." : "Time is syncing with the current clock."}
          {" · "}
          <button type="button" className="text-btn inline-link" onClick={syncCurrentTime}>
            Use current time
          </button>
        </p>

        <div className="actions">
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "Submitting…" : "Submit request"}
          </button>
        </div>
      </form>

      <section className="kpi-grid" style={{ marginTop: "1.5rem" }}>
        <article className="kpi featured">
          <span>Total requests</span>
          <strong>{requests.length}</strong>
        </article>
        <article className="kpi">
          <span>In progress</span>
          <strong>{active.length}</strong>
        </article>
        <article className="kpi">
          <span>Completed</span>
          <strong>{completed.length}</strong>
        </article>
      </section>

      <div className="table-wrap" style={{ marginTop: "1.5rem" }}>
        <div className="section-head">
          <h2>My requests</h2>
          <span>{requests.length} total</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Date / time</th>
              <th>Request</th>
              <th>Details</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {requests.length === 0 ? (
              <tr>
                <td colSpan={4} className="hint">
                  No requests yet. Submit your first request above.
                </td>
              </tr>
            ) : (
              requests.map((item) => (
                <tr
                  key={item.id}
                  className={item.status === "completed" ? "row-done" : ""}
                >
                  <td>{formatRequestDateTime(item.date, item.time)}</td>
                  <td>{requestTypeLabel(item.request)}</td>
                  <td className="request-details-cell">
                    <RequestDetailsCell details={item.details} />
                  </td>
                  <td>
                    <span className={requestStatusPill(item.status)}>
                      {requestStatusLabel(item.status)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
