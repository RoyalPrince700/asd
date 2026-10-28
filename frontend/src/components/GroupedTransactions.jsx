import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { RemarkTag } from "./RemarkTag.jsx";
import { TransactionReportDownload } from "./TransactionReportDownload.jsx";
import { companyLabel } from "../constants/companies";
import { enteredByLabel } from "../utils/role.js";
import {
  currentMonth,
  formatMonth,
  groupTransactions,
  placementKey,
  recordsForQuery,
  recordsInMonth,
} from "../utils/transactionGroups.js";

const PAGE_SIZE = 50;

function fmt(value, decimals) {
  return Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: decimals,
  });
}

function pluralLabel(label, count) {
  const word = String(label || "item").toLowerCase();
  if (count === 1) return word;
  return word.endsWith("s") ? word : `${word}s`;
}

function postedSummary(rows, postedBy) {
  const labels = new Set(rows.map((row) => postedBy(row)));
  if (labels.size <= 1) return [...labels][0] || "—";
  return `${labels.size} staff`;
}

export function GroupedTransactions({
  title,
  records,
  loading,
  itemLabel = "Product",
  emptyMessage = "No transactions yet.",
  resetKey = "",
  initialQuery = "",
  expandKey = "",
  expandSignal = 0,
  showPostedBy = false,
  showStatus = false,
  showCompany = false,
  showActions = false,
  postedBy = (row) => enteredByLabel(row.enteredBy),
  Remark = RemarkTag,
  decimals = 0,
  downloadParams,
}) {
  const [page, setPage] = useState(1);
  const [openKeys, setOpenKeys] = useState(() => new Set());
  const [stockIdSearch, setStockIdSearch] = useState(initialQuery);
  const [appliedStockId, setAppliedStockId] = useState(initialQuery.trim());
  const [month, setMonth] = useState(currentMonth);

  const keyOf = showCompany ? placementKey : undefined;
  const monthRecords = useMemo(
    () => (downloadParams ? recordsInMonth(records, month) : records),
    [downloadParams, records, month]
  );
  const visibleGroups = useMemo(
    () => groupTransactions(recordsForQuery(monthRecords, appliedStockId, keyOf), keyOf),
    [monthRecords, appliedStockId, keyOf]
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
  const colSpan =
    8 +
    (showCompany ? 2 : 0) +
    (showPostedBy ? 1 : 0) +
    (showStatus ? 1 : 0) +
    (showActions ? 1 : 0);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
    setStockIdSearch(initialQuery || "");
    setAppliedStockId(String(initialQuery || "").trim());
    setOpenKeys(new Set());
  }, [resetKey, initialQuery]);

  function changeMonth(next) {
    setMonth(next);
    setPage(1);
    setOpenKeys(new Set());
  }

  useEffect(() => {
    if (!expandSignal || !expandKey) return;
    setOpenKeys((prev) => {
      const next = new Set(prev);
      next.add(expandKey);
      return next;
    });
    setPage(1);
    setStockIdSearch("");
    setAppliedStockId("");
  }, [expandSignal, expandKey]);

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

  function toggleGroup(key) {
    setOpenKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <section className="table-wrap">
      <div className="section-head">
        <h2>{title}</h2>
        <span>
          {totalMaterials.toLocaleString()} {pluralLabel(itemLabel, totalMaterials)}
          {totalRecordsShown
            ? ` · ${totalRecordsShown.toLocaleString()} ${totalRecordsShown === 1 ? "record" : "records"}`
            : ""}
        </span>
      </div>
      {downloadParams ? (
        <TransactionReportDownload
          params={downloadParams}
          month={month}
          onMonthChange={changeMonth}
        />
      ) : null}
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
          placeholder={`Search by ${itemLabel.toLowerCase()} or stock ID`}
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
              {showCompany ? <th>Company</th> : null}
              {showCompany ? <th>Location</th> : null}
              <th>{itemLabel}</th>
              <th>Opening</th>
              <th>In</th>
              <th>Out</th>
              <th>Remark</th>
              <th>Closing</th>
              {showPostedBy ? <th>Posted by</th> : null}
              {showStatus ? <th>Status</th> : null}
              {showActions ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {loading && records.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="hint">
                  Loading transactions…
                </td>
              </tr>
            ) : pageGroups.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="hint">
                  {appliedStockId
                    ? "No item matches that search."
                    : downloadParams
                      ? `No transactions in ${formatMonth(month) || "this month"}.`
                      : emptyMessage}
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
                      {showCompany ? (
                        <td>{companyLabel(group.company, { short: true })}</td>
                      ) : null}
                      {showCompany ? <td>{group.location || "—"}</td> : null}
                      <td className="txn-material-cell">
                        <span className="txn-material">{group.name}</span>
                        <span className="txn-meta">
                          {group.count} record{group.count === 1 ? "" : "s"}
                        </span>
                      </td>
                      <td>{fmt(group.opening, decimals)}</td>
                      <td>{fmt(group.inbound, decimals)}</td>
                      <td>{fmt(group.outbound, decimals)}</td>
                      <td>{group.remark ? <Remark value={group.remark} /> : "—"}</td>
                      <td className="num-strong">{fmt(group.closing, decimals)}</td>
                      {showPostedBy ? <td>{postedSummary(group.rows, postedBy)}</td> : null}
                      {showStatus ? (
                        <td>
                          {group.pending ? (
                            <span className="status-pill status-pill--pending">
                              Awaiting CFO
                            </span>
                          ) : (
                            <span className="hint">Approved</span>
                          )}
                        </td>
                      ) : null}
                      {showActions ? <td className="hint">Open</td> : null}
                    </tr>
                    {open
                      ? group.rows.map((row) => (
                          <tr
                            key={row._id}
                            className={`txn-child${row.pendingApproval ? " row-pending" : ""}`}
                          >
                            <td className="stock-id">{row.stockId || "—"}</td>
                            <td>{String(row.date).slice(0, 10)}</td>
                            {showCompany ? (
                              <td>{companyLabel(row.company, { short: true })}</td>
                            ) : null}
                            {showCompany ? <td>{row.location || "—"}</td> : null}
                            <td>{row.productName}</td>
                            <td>{fmt(row.openingBalance, decimals)}</td>
                            <td>{fmt(row.inbound, decimals)}</td>
                            <td>{fmt(row.outbound, decimals)}</td>
                            <td>
                              <Remark value={row.remark} />
                            </td>
                            <td className="num-strong">{fmt(row.closingBalance, decimals)}</td>
                            {showPostedBy ? <td>{postedBy(row)}</td> : null}
                            {showStatus ? (
                              <td>
                                {row.pendingApproval ? (
                                  <span className="status-pill status-pill--pending">
                                    Awaiting CFO
                                  </span>
                                ) : (
                                  <span className="hint">Approved</span>
                                )}
                              </td>
                            ) : null}
                            {showActions ? (
                              <td className="row-actions">
                                <button
                                  type="button"
                                  className="text-btn"
                                  disabled={row.pendingApproval}
                                  onClick={() => onEdit?.(row)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="text-btn danger"
                                  onClick={() => onDelete?.(row._id)}
                                >
                                  Delete
                                </button>
                              </td>
                            ) : null}
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
            {pluralLabel(itemLabel, totalMaterials)}
            {appliedStockId ? ` matching "${appliedStockId}"` : ""}
          </span>
          <div className="pagination-actions">
            <button
              type="button"
              className="ghost"
              disabled={safePage <= 1 || loading}
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
              disabled={safePage >= totalPages || loading}
              onClick={() => setPage(safePage + 1)}
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
