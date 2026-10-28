import { useEffect, useState } from "react";
import { api } from "../api";
import { RemarkTag } from "../components/RemarkTag.jsx";
import { enteredByLabel } from "../utils/role.js";

const PAGE_SIZE = 50;

function fmt(value) {
  return Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
}

function fmtWhen(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PressDeletionLog() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState("");
  const [stockIdSearch, setStockIdSearch] = useState("");
  const [appliedStockId, setAppliedStockId] = useState("");

  async function loadLog(nextPage = 1, nextStockId = appliedStockId) {
    setListLoading(true);
    setError("");
    try {
      const params = { page: nextPage, limit: PAGE_SIZE };
      if (nextStockId) params.stockId = nextStockId;
      const data = await api.pressDeletions(params);
      const deletions = data.deletions || [];
      setRows(deletions);
      setTotal(data.total ?? deletions.length);
      setPage(data.page ?? nextPage);
      setTotalPages(data.totalPages ?? 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    loadLog().catch((err) => setError(err.message));
  }, []);

  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Press manager</p>
          <h1>Deletion log</h1>
        </div>
        <p className="lede tight">
          Transactions removed by Press staff. They are gone from movement and
          inventory, and this log keeps who deleted them.
        </p>
      </header>

      {error ? <p className="alert">{error}</p> : null}

      <section className="table-wrap">
        <div className="section-head">
          <h2>Deleted transactions</h2>
          <span>{total.toLocaleString()} records</span>
        </div>
        <form
          className="list-toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            const next = stockIdSearch.trim();
            setAppliedStockId(next);
            loadLog(1, next).catch((err) => setError(err.message));
          }}
        >
          <input
            type="search"
            placeholder="Search by stock ID (e.g. STK-000001)"
            value={stockIdSearch}
            onChange={(e) => setStockIdSearch(e.target.value)}
          />
          <button type="submit">Search</button>
          {appliedStockId ? (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setStockIdSearch("");
                setAppliedStockId("");
                loadLog(1, "").catch((err) => setError(err.message));
              }}
            >
              Clear
            </button>
          ) : null}
        </form>
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
                <th>Posted by</th>
                <th>Deleted by</th>
                <th>Deleted at</th>
              </tr>
            </thead>
            <tbody>
              {listLoading && rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="hint">
                    Loading deletion log…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="hint">
                    {appliedStockId
                      ? "No deleted transaction matches that stock ID."
                      : "No Press transactions have been deleted."}
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row._id}>
                    <td className="stock-id">{row.stockId || "—"}</td>
                    <td>{String(row.date).slice(0, 10)}</td>
                    <td>{row.productName}</td>
                    <td>{fmt(row.inbound)}</td>
                    <td>{fmt(row.outbound)}</td>
                    <td>
                      <RemarkTag value={row.remark} />
                    </td>
                    <td className="num-strong">{fmt(row.closingBalance)}</td>
                    <td>{enteredByLabel(row.enteredBy)}</td>
                    <td>{enteredByLabel(row.deletedBy)}</td>
                    <td>{fmtWhen(row.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {rows.length > 0 ? (
          <div className="pagination">
            <span>
              Showing {start}–{end} of {total.toLocaleString()}
              {appliedStockId ? ` matching "${appliedStockId}"` : ""}
            </span>
            <div className="pagination-actions">
              <button
                type="button"
                className="ghost"
                disabled={page <= 1 || listLoading}
                onClick={() =>
                  loadLog(page - 1, appliedStockId).catch((err) => setError(err.message))
                }
              >
                Previous
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                className="ghost"
                disabled={page >= totalPages || listLoading}
                onClick={() =>
                  loadLog(page + 1, appliedStockId).catch((err) => setError(err.message))
                }
              >
                Next
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
