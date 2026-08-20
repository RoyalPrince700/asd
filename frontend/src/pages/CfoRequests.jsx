import { useEffect, useState } from "react";
import { api } from "../api";
import { useDialog } from "../context/DialogContext.jsx";
import {
  REQUEST_STATUSES,
  formatRequestDateTime,
  requestStatusLabel,
  requestStatusPill,
  requestTypeLabel,
} from "../constants/requests";

const VIEWS = [
  { id: "active", label: "Active queue", queue: "active" },
  { id: "completed", label: "Completed", status: "completed" },
];

function submitterLabel(user) {
  if (!user?.name) return "—";
  return user.name;
}

export function CfoRequests() {
  const { confirm, toast } = useDialog();
  const [view, setView] = useState("active");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [downloading, setDownloading] = useState("");

  const activeView = VIEWS.find((item) => item.id === view) || VIEWS[0];

  async function load(nextView = view) {
    setLoading(true);
    setError("");
    try {
      const viewConfig = VIEWS.find((item) => item.id === nextView) || VIEWS[0];
      const params =
        viewConfig.status === "completed"
          ? { status: "completed" }
          : { queue: "active" };
      const data = await api.requests(params);
      setRequests(data.requests);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(view).catch((err) => setError(err.message));
  }, [view]);

  async function updateStatus(id, status) {
    setBusyId(id);
    setError("");
    try {
      await api.updateRequest(id, { status });
      await load(view);
      if (status === "completed") {
        toast({ message: "Request completed and moved to Completed.", type: "success" });
      } else {
        toast({ message: "Status updated.", type: "success" });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  async function removeRequest(id) {
    const ok = await confirm({
      title: "Delete request",
      message: "Delete this request permanently? This cannot be undone.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;

    setBusyId(id);
    setError("");
    try {
      await api.deleteRequest(id);
      await load(view);
      toast({ message: "Request deleted.", type: "success" });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  async function download(type) {
    setDownloading(type);
    setError("");
    try {
      await api.downloadRequestsReport(type);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading("");
    }
  }

  const activeCount = view === "active" ? requests.length : 0;

  return (
    <div className="page">
      <header className="page-head split">
        <div>
          <p className="eyebrow">Chief Financial Officer</p>
          <h1>Requests</h1>
          <p className="lede tight">
            Active requests are sorted earliest first. When you mark a request as
            completed, it moves to the Completed tab with the newest at the top.
            Download Word or Excel for a full record of pending and completed requests.
          </p>
        </div>
        <div className="export-row">
          <button
            type="button"
            className="ghost"
            disabled={Boolean(downloading)}
            onClick={() => download("docx")}
          >
            {downloading === "docx" ? "Preparing…" : "Download Word"}
          </button>
          <button
            type="button"
            disabled={Boolean(downloading)}
            onClick={() => download("excel")}
          >
            {downloading === "excel" ? "Preparing…" : "Download Excel"}
          </button>
        </div>
      </header>

      <div className="tab-bar">
        {VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={view === item.id ? "tab active" : "tab"}
            onClick={() => setView(item.id)}
          >
            {item.label}
            {item.id === "active" && view === "active" && activeCount > 0 ? (
              <span className="tab-count">{activeCount}</span>
            ) : null}
          </button>
        ))}
      </div>

      {error ? <p className="alert">{error}</p> : null}

      <section className="table-wrap">
        <div className="section-head">
          <h2>{activeView.label}</h2>
          <span>
            {requests.length} requests
            {view === "active" ? " · earliest first" : " · newest completed first"}
          </span>
        </div>

        {loading ? (
          <p className="hint empty-hint">Loading requests…</p>
        ) : requests.length === 0 ? (
          <p className="hint empty-hint">
            {view === "completed"
              ? "No completed requests yet."
              : "No active requests in the queue."}
          </p>
        ) : (
          <div className="table-scroll wide-table">
            <table>
              <thead>
                <tr>
                  <th>Request</th>
                  <th>Date / time</th>
                  <th>Submitted by</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {requests.map((item) => (
                  <tr
                    key={item.id}
                    className={item.status === "completed" ? "row-done" : ""}
                  >
                    <td>{requestTypeLabel(item.request)}</td>
                    <td>{formatRequestDateTime(item.date, item.time)}</td>
                    <td>{submitterLabel(item.submittedBy)}</td>
                    <td>
                      <select
                        value={item.status || "pending"}
                        disabled={busyId === item.id}
                        onChange={(e) => updateStatus(item.id, e.target.value)}
                      >
                        {REQUEST_STATUSES.map((status) => (
                          <option key={status.id} value={status.id}>
                            {status.label}
                          </option>
                        ))}
                      </select>
                      <div style={{ marginTop: "6px" }}>
                        <span className={requestStatusPill(item.status)}>
                          {requestStatusLabel(item.status)}
                        </span>
                      </div>
                    </td>
                    <td className="row-actions">
                      <button
                        type="button"
                        className="text-btn danger"
                        disabled={busyId === item.id}
                        onClick={() => removeRequest(item.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
