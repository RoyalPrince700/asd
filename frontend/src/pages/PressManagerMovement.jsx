import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { api } from "../api";
import { RemarkTag } from "../components/RemarkTag.jsx";
import { TransactionReportDownload } from "../components/TransactionReportDownload.jsx";
import { enteredByLabel } from "../utils/role.js";
import {
  currentMonth,
  formatMonth,
  groupTransactions,
  recordsForQuery,
  recordsInMonth,
} from "../utils/transactionGroups.js";

const PAGE_SIZE = 50;
const COMPANY = "press";

function fmt(value) {
  return Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
}

function groupPostedBy(rows) {
  const labels = new Set(rows.map((row) => enteredByLabel(row.enteredBy)));
  if (labels.size === 1) return [...labels][0];
  return `${labels.size} staff`;
}

export function PressManagerMovement() {
  const [records, setRecords] = useState([]);
  const [page, setPage] = useState(1);
  const [listLoading, setListLoading] = useState(true);
  const [openKeys, setOpenKeys] = useState(() => new Set());
  const [error, setError] = useState("");
  const [stockIdSearch, setStockIdSearch] = useState("");
  const [appliedStockId, setAppliedStockId] = useState("");
  const [month, setMonth] = useState(currentMonth);

  async function loadRecords() {
    setListLoading(true);
    setError("");
    try {
      const data = await api.records({ company: COMPANY });
      setRecords(data.records || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setListLoading(false);
    }
  }

  function toggleGroup(key) {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  useEffect(() => {
    loadRecords().catch((err) => setError(err.message));
  }, []);

  const visibleGroups = useMemo(
    () => groupTransactions(recordsForQuery(recordsInMonth(records, month), appliedStockId)),
    [records, month, appliedStockId]
  );

  const totalMaterials = visibleGroups.length;
  const totalRecordsShown = visibleGroups.reduce((sum, group) => sum + group.count, 0);
  const totalPages = Math.max(1, Math.ceil(totalMaterials / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = totalMaterials === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const end = Math.min(safePage * PAGE_SIZE, totalMaterials);
  const pageGroups = visibleGroups.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    const query = appliedStockId.trim();
    if (!query || visibleGroups.length !== 1) return;
    const key = visibleGroups[0].key;
    setOpenKeys((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, [appliedStockId, visibleGroups]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Press manager</p>
          <h1>All Press movements</h1>
        </div>
        <p className="lede tight">
          Each material appears once. Open a material to see every In and Out
          posted against it. Inventory totals are on the Inventory page.
        </p>
      </header>

      {error ? <p className="alert">{error}</p> : null}

      <section className="table-wrap">
        <div className="section-head">
          <h2>Press transactions</h2>
          <span>
            {totalMaterials.toLocaleString()}{" "}
            {totalMaterials === 1 ? "material" : "materials"}
            {totalRecordsShown
              ? ` · ${totalRecordsShown.toLocaleString()} ${totalRecordsShown === 1 ? "record" : "records"}`
              : ""}
          </span>
        </div>
        <TransactionReportDownload
          params={{ company: COMPANY }}
          month={month}
          onMonthChange={(next) => {
            setMonth(next);
            setPage(1);
            setOpenKeys(new Set());
          }}
        />
        <form
          className="list-toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            setAppliedStockId(stockIdSearch.trim());
            setPage(1);
          }}
        >
          <input
            type="search"
            placeholder="Search by material or stock ID"
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
                setPage(1);
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
                <th>Opening</th>
                <th>In</th>
                <th>Out</th>
                <th>Remark</th>
                <th>Closing</th>
                <th>Posted by</th>
              </tr>
            </thead>
            <tbody>
              {listLoading && records.length === 0 ? (
                <tr>
                  <td colSpan={9} className="hint">
                    Loading transactions…
                  </td>
                </tr>
              ) : pageGroups.length === 0 ? (
                <tr>
                  <td colSpan={9} className="hint">
                    {appliedStockId
                      ? "No material matches that search."
                      : `No Press transactions in ${formatMonth(month) || "this month"}.`}
                  </td>
                </tr>
              ) : (
                pageGroups.map((group) => {
                  const open = openKeys.has(group.key);
                  return (
                    <Fragment key={group.key}>
                      <tr
                        className={`txn-group${group.pending ? " row-pending" : ""}`}
                        onClick={() => toggleGroup(group.key)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleGroup(group.key);
                          }
                        }}
                        tabIndex={0}
                        aria-expanded={open}
                      >
                        <td className="stock-id">
                          <span className="txn-chevron" aria-hidden="true">
                            {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                          </span>
                        </td>
                        <td>{String(group.date).slice(0, 10)}</td>
                        <td className="txn-material-cell">
                          <span className="txn-material">{group.name}</span>
                          <span className="txn-meta">
                            {group.count} record{group.count === 1 ? "" : "s"}
                          </span>
                        </td>
                        <td>{fmt(group.opening)}</td>
                        <td>{fmt(group.inbound)}</td>
                        <td>{fmt(group.outbound)}</td>
                        <td>
                          {group.remark ? <RemarkTag value={group.remark} /> : "—"}
                        </td>
                        <td className="num-strong">{fmt(group.closing)}</td>
                        <td>{groupPostedBy(group.rows)}</td>
                      </tr>
                      {open
                        ? group.rows.map((row) => (
                            <tr key={row._id} className="txn-child">
                              <td className="stock-id">{row.stockId || "—"}</td>
                              <td>{row.date.slice(0, 10)}</td>
                              <td>{row.productName}</td>
                              <td>{fmt(row.openingBalance)}</td>
                              <td>{fmt(row.inbound)}</td>
                              <td>{fmt(row.outbound)}</td>
                              <td>
                                <RemarkTag value={row.remark} />
                              </td>
                              <td className="num-strong">{fmt(row.closingBalance)}</td>
                              <td>{enteredByLabel(row.enteredBy)}</td>
                            </tr>
                          ))
                        : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {pageGroups.length > 0 ? (
          <div className="pagination">
            <span>
              Showing {start}–{end} of {totalMaterials.toLocaleString()}{" "}
              {totalMaterials === 1 ? "material" : "materials"}
              {appliedStockId ? ` matching "${appliedStockId}"` : ""}
            </span>
            <div className="pagination-actions">
              <button
                type="button"
                className="ghost"
                disabled={safePage <= 1 || listLoading}
                onClick={() => setPage(safePage - 1)}
              >
                Previous
              </button>
              <span>
                Page {safePage} of {totalPages}
              </span>
              <button
                type="button"
                className="ghost"
                disabled={safePage >= totalPages || listLoading}
                onClick={() => setPage(safePage + 1)}
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
