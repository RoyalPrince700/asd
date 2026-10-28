import { useEffect, useState } from "react";
import { api } from "../api";
import { RemarkTag } from "../components/RemarkTag.jsx";
import { useDialog } from "../context/DialogContext.jsx";
import { enteredByLabel } from "../utils/role.js";

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
  return String(value).slice(0, 10);
}

export function PressApprovals() {
  const { confirm, toast } = useDialog();
  const [tab, setTab] = useState("pending");
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  async function load(status = tab) {
    setLoading(true);
    setError("");
    try {
      const data = await api.pressMaterials({ status });
      setMaterials(data.materials || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(tab).catch((err) => setError(err.message));
  }, [tab]);

  async function approve(row) {
    const ok = await confirm({
      title: "Approve raw material",
      message: `Add ${row.name} to the Press catalog with stock ID ${row.stockId}?`,
      confirmLabel: "Approve",
    });
    if (!ok) return;

    setBusyId(row._id);
    setError("");
    try {
      const result = await api.approvePressMaterial(row._id);
      await load(tab);
      toast({
        message: result.message || `${row.name} approved.`,
        type: "success",
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  async function reject(row) {
    const ok = await confirm({
      title: "Reject raw material",
      message: `Reject ${row.name}? It will not be added to inventory.`,
      confirmLabel: "Reject",
      variant: "danger",
    });
    if (!ok) return;

    setBusyId(row._id);
    setError("");
    try {
      const result = await api.rejectPressMaterial(row._id);
      await load(tab);
      toast({
        message: result.message || `${row.name} rejected.`,
        type: "success",
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Press manager</p>
          <h1>New raw materials</h1>
        </div>
        <p className="lede tight">
          Approve or reject raw materials added by Press staff. Approved items
          enter the catalog and inventory with the stock ID already assigned.
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
            {item.id === "pending" && tab === "pending" && materials.length > 0 ? (
              <span className="tab-count">{materials.length}</span>
            ) : null}
          </button>
        ))}
      </div>

      {error ? <p className="alert">{error}</p> : null}

      <section className="table-wrap">
        <div className="section-head">
          <h2>
            {tab === "pending"
              ? "Awaiting your approval"
              : tab === "approved"
                ? "Approved materials"
                : "Rejected materials"}
          </h2>
          <span>{materials.length} items</span>
        </div>

        {loading ? (
          <p className="hint empty-hint">Loading materials…</p>
        ) : materials.length === 0 ? (
          <p className="hint empty-hint">
            {tab === "pending"
              ? "No new raw materials awaiting approval."
              : `No ${tab} materials yet.`}
          </p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Stock ID</th>
                  <th>Date</th>
                  <th>Material</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>Remark</th>
                  <th>Closing</th>
                  <th>Added by</th>
                  <th>Source</th>
                  {tab === "pending" ? <th /> : <th>Reviewed</th>}
                </tr>
              </thead>
              <tbody>
                {materials.map((row) => (
                  <tr key={row._id}>
                    <td className="stock-id">{row.stockId}</td>
                    <td>{fmtDate(row.date)}</td>
                    <td>{row.name}</td>
                    <td>{fmt(row.inbound)}</td>
                    <td>{fmt(row.outbound)}</td>
                    <td>
                      <RemarkTag value={row.remark} />
                    </td>
                    <td className="num-strong">{fmt(row.closingBalance)}</td>
                    <td>{enteredByLabel(row.submittedBy)}</td>
                    <td>{row.source === "upload" ? "Bulk upload" : "Manual"}</td>
                    {tab === "pending" ? (
                      <td className="row-actions">
                        <button
                          type="button"
                          className="text-btn"
                          disabled={busyId === row._id}
                          onClick={() => approve(row)}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="text-btn danger"
                          disabled={busyId === row._id}
                          onClick={() => reject(row)}
                        >
                          Reject
                        </button>
                      </td>
                    ) : (
                      <td>
                        <div>{enteredByLabel(row.reviewedBy)}</div>
                        <small className="hint">{fmtDate(row.reviewedAt)}</small>
                      </td>
                    )}
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
