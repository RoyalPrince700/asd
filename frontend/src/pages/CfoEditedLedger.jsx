import { useEffect, useState } from "react";
import { api } from "../api";
import { companyLabel } from "../constants/companies";
import { useDialog } from "../context/DialogContext.jsx";
import { roleLabel } from "../utils/role.js";

const TABS = [
  { id: "pending", label: "Awaiting approval" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

function fmt(value) {
  return Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
}

function fmtDate(value) {
  if (!value) return "—";
  return new Date(value).toISOString().slice(0, 10);
}

function ChangeCell({ before, after, format = (v) => v }) {
  if (before === after) {
    return <td>{format(after)}</td>;
  }
  return (
    <td>
      <span className="edit-diff">
        <span className="edit-diff-before">{format(before)}</span>
        <span className="edit-diff-arrow">→</span>
        <span className="edit-diff-after">{format(after)}</span>
      </span>
    </td>
  );
}

function submitterLabel(user) {
  if (!user) return "—";
  return `${user.name} (${roleLabel(user.role)})`;
}

export function CfoEditedLedger() {
  const { confirm, toast } = useDialog();
  const [tab, setTab] = useState("pending");
  const [changes, setChanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  async function load(status = tab) {
    setLoading(true);
    setError("");
    try {
      const data = await api.recordChanges({ status });
      setChanges(data.changes);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(tab).catch((err) => setError(err.message));
  }, [tab]);

  async function approve(id) {
    const ok = await confirm({
      title: "Approve edit",
      message: "Approve this edit? The updated values will remain permanent.",
      confirmLabel: "Approve",
    });
    if (!ok) return;

    setBusyId(id);
    setError("");
    try {
      await api.approveRecordChange(id);
      await load(tab);
      toast({ message: "Edit approved.", type: "success" });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  async function reject(id) {
    const ok = await confirm({
      title: "Reject edit",
      message:
        "Reject this edit? The transaction will revert to its values before the edit.",
      confirmLabel: "Reject",
      variant: "danger",
    });
    if (!ok) return;

    setBusyId(id);
    setError("");
    try {
      await api.rejectRecordChange(id);
      await load(tab);
      toast({ message: "Edit rejected and transaction reverted.", type: "success" });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  const pendingCount = tab === "pending" ? changes.length : null;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">CFO · Review queue</p>
          <h1>Edited ledger</h1>
        </div>
        <p className="lede tight">
          Review edits made by data clerks and accountants. Approving keeps the
          change permanent; rejecting restores the transaction to its previous
          values.
        </p>
      </header>

      <div className="tab-bar">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={tab === item.id ? "tab active" : "tab"}
            onClick={() => setTab(item.id)}
          >
            {item.label}
            {item.id === "pending" && pendingCount != null && pendingCount > 0 ? (
              <span className="tab-count">{pendingCount}</span>
            ) : null}
          </button>
        ))}
      </div>

      {error ? <p className="alert">{error}</p> : null}

      <section className="table-wrap">
        <div className="section-head">
          <h2>
            {tab === "pending"
              ? "Pending edits"
              : tab === "approved"
                ? "Approved edits"
                : "Rejected edits"}
          </h2>
          <span>{changes.length} requests</span>
        </div>

        {loading ? (
          <p className="hint empty-hint">Loading edit requests…</p>
        ) : changes.length === 0 ? (
          <p className="hint empty-hint">
            {tab === "pending"
              ? "No edits awaiting approval."
              : `No ${tab} edits yet.`}
          </p>
        ) : (
          <div className="table-scroll wide-table">
            <table className="edit-review-table">
              <thead>
                <tr>
                  <th>Submitted</th>
                  <th>Edited by</th>
                  <th>Company</th>
                  <th>Location</th>
                  <th>Product</th>
                  <th>Date</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>Closing</th>
                  {tab === "pending" ? <th /> : null}
                  {tab !== "pending" ? <th>Reviewed</th> : null}
                </tr>
              </thead>
              <tbody>
                {changes.map((change) => {
                  const before = change.originalSnapshot;
                  const after = change.proposed;
                  return (
                    <tr key={change._id}>
                      <td>{fmtDate(change.createdAt)}</td>
                      <td>{submitterLabel(change.submittedBy)}</td>
                      <ChangeCell
                        before={before.company}
                        after={after.company}
                        format={(v) => companyLabel(v, { short: true })}
                      />
                      <ChangeCell
                        before={before.location || "—"}
                        after={after.location || "—"}
                      />
                      <ChangeCell before={before.productName} after={after.productName} />
                      <ChangeCell
                        before={before.date}
                        after={after.date}
                        format={fmtDate}
                      />
                      <ChangeCell
                        before={before.inbound}
                        after={after.inbound}
                        format={fmt}
                      />
                      <ChangeCell
                        before={before.outbound}
                        after={after.outbound}
                        format={fmt}
                      />
                      <ChangeCell
                        before={before.closingBalance}
                        after={after.closingBalance}
                        format={fmt}
                      />
                      {tab === "pending" ? (
                        <td className="row-actions">
                          <button
                            type="button"
                            className="text-btn"
                            disabled={busyId === change._id}
                            onClick={() => approve(change._id)}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="text-btn danger"
                            disabled={busyId === change._id}
                            onClick={() => reject(change._id)}
                          >
                            Reject
                          </button>
                        </td>
                      ) : null}
                      {tab !== "pending" ? (
                        <td>
                          <div>{submitterLabel(change.reviewedBy)}</div>
                          <small className="hint">{fmtDate(change.reviewedAt)}</small>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
