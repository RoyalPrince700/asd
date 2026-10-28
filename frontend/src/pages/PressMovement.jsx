import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { api } from "../api";
import { SearchableSelect } from "../components/SearchableSelect.jsx";
import { RemarkTag } from "../components/RemarkTag.jsx";
import { MovementUpload } from "../components/MovementUpload.jsx";
import { TransactionReportDownload } from "../components/TransactionReportDownload.jsx";
import { useDialog } from "../context/DialogContext.jsx";
import {
  DEFAULT_TRANSACTION_REMARK,
  TRANSACTION_REMARKS,
} from "../constants/transactionRemarks.js";
import {
  currentMonth,
  formatMonth,
  groupTransactions,
  materialKey,
  recordsForQuery,
  recordsInMonth,
} from "../utils/transactionGroups.js";

const PAGE_SIZE = 50;
const COMPANY = "press";

const emptyForm = {
  productName: "",
  date: new Date().toISOString().slice(0, 10),
  inbound: "",
  outbound: "",
  remark: DEFAULT_TRANSACTION_REMARK,
};

const emptyMaterial = {
  name: "",
  date: new Date().toISOString().slice(0, 10),
  inbound: "",
  outbound: "",
  remark: DEFAULT_TRANSACTION_REMARK,
};

function n(value) {
  const x = Number(value);
  return Number.isFinite(x) ? x : 0;
}

function fmt(value) {
  return Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
}

export function PressMovement() {
  const { confirm, toast } = useDialog();

  const [form, setForm] = useState(emptyForm);
  const [products, setProducts] = useState([]);
  const [records, setRecords] = useState([]);
  const [page, setPage] = useState(1);
  const [listLoading, setListLoading] = useState(true);
  const [openKeys, setOpenKeys] = useState(() => new Set());
  const [openingBalance, setOpeningBalance] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [stockIdSearch, setStockIdSearch] = useState("");
  const [appliedStockId, setAppliedStockId] = useState("");
  const [month, setMonth] = useState(currentMonth);
  const [showNewMaterial, setShowNewMaterial] = useState(false);
  const [materialForm, setMaterialForm] = useState(emptyMaterial);
  const [materialBusy, setMaterialBusy] = useState(false);
  const [pendingMaterials, setPendingMaterials] = useState([]);

  const closing = useMemo(
    () => openingBalance + n(form.inbound) - n(form.outbound),
    [openingBalance, form.inbound, form.outbound]
  );

  const materialClosing = useMemo(
    () => n(materialForm.inbound) - n(materialForm.outbound),
    [materialForm.inbound, materialForm.outbound]
  );

  const productOptions = useMemo(() => {
    const names = products.map((product) => product.name);
    if (form.productName && !names.includes(form.productName)) {
      return [form.productName, ...names];
    }
    return names;
  }, [products, form.productName]);

  async function loadRecords() {
    setListLoading(true);
    try {
      const data = await api.records({ company: COMPANY });
      setRecords(data.records || []);
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

  async function loadProducts() {
    const data = await api.products({ company: COMPANY });
    setProducts(data.products);
  }

  async function loadPendingMaterials() {
    const data = await api.pressMaterials({ status: "pending" });
    setPendingMaterials(data.materials || []);
  }

  useEffect(() => {
    loadProducts().catch((err) => setError(err.message));
    loadRecords().catch((err) => setError(err.message));
    loadPendingMaterials().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!form.productName) {
      setOpeningBalance(0);
      return;
    }

    api
      .stockLevel(form.productName, COMPANY, editingId)
      .then((data) => setOpeningBalance(data.openingBalance))
      .catch((err) => setError(err.message));
  }, [form.productName, editingId]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function setMaterialField(key, value) {
    setMaterialForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmitMaterial(e) {
    e.preventDefault();
    setMaterialBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api.createPressMaterial({
        name: materialForm.name.trim(),
        date: materialForm.date,
        inbound: n(materialForm.inbound),
        outbound: n(materialForm.outbound),
        remark: materialForm.remark,
      });
      const successMessage =
        result.message ||
        `Submitted for approval. Stock ID ${result.material?.stockId}.`;
      setNotice(successMessage);
      setMaterialForm({ ...emptyMaterial, date: materialForm.date });
      setShowNewMaterial(false);
      await loadPendingMaterials();
      toast({ message: successMessage, type: "success" });
    } catch (err) {
      setError(err.message);
    } finally {
      setMaterialBusy(false);
    }
  }

  function resetForm() {
    setForm({ ...emptyForm, date: form.date });
    setEditingId(null);
  }

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        company: COMPANY,
        productName: form.productName,
        date: form.date,
        inbound: n(form.inbound),
        outbound: n(form.outbound),
        remark: form.remark,
        stockReceived: 0,
        stockOut: 0,
      };

      let successMessage = "Transaction posted.";

      if (editingId) {
        const result = await api.updateRecord(editingId, payload);
        successMessage = result.message || "Edit saved and sent to CFO for approval.";
        setNotice(successMessage);
      } else {
        const result = await api.createRecord(payload);
        const stockId = result.record?.stockId;
        successMessage = stockId
          ? `Transaction posted. Stock ID ${stockId}.`
          : "Transaction posted.";
        setNotice(successMessage);
      }

      const postedKey = materialKey(form.productName);
      resetForm();
      setStockIdSearch("");
      setAppliedStockId("");
      setPage(1);
      setOpenKeys((prev) => {
        const next = new Set(prev);
        next.add(postedKey);
        return next;
      });
      await loadRecords();
      toast({ message: successMessage, type: "success" });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function edit(row) {
    if (row.pendingApproval) {
      toast({
        message: "This transaction already has an edit awaiting CFO approval.",
        type: "info",
      });
      return;
    }

    setEditingId(row._id);
    setForm({
      productName: row.productName,
      date: row.date.slice(0, 10),
      inbound: String(row.inbound),
      outbound: String(row.outbound),
      remark: row.remark || DEFAULT_TRANSACTION_REMARK,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(id) {
    const ok = await confirm({
      title: "Delete transaction",
      message: "Delete this raw material transaction?",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;

    try {
      await api.deleteRecord(id);
      if (editingId === id) resetForm();
      await loadRecords();
      toast({ message: "Transaction deleted.", type: "success" });
    } catch (err) {
      setError(err.message);
    }
  }

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
      <header className="page-head split">
        <div>
          <p className="eyebrow">Press</p>
          <h1>Raw materials movement</h1>
          <p className="lede tight">
            Post In or Out for materials already in the catalog. Each material
            appears once. Another movement for a material you already recorded is
            added under that same row — open it to see every posting. Use + to
            add a new raw material; a press manager approves it before it appears
            in inventory.
          </p>
        </div>
        <button type="button" onClick={() => setShowNewMaterial((open) => !open)}>
          {showNewMaterial ? "Close" : "+ Raw material"}
        </button>
      </header>

      {showNewMaterial ? (
        <form className="entry-card" onSubmit={onSubmitMaterial}>
          <div className="section-head">
            <h2>Add a raw material</h2>
          </div>
          <p className="hint">
            Type the material name, then In and Out. A stock ID is assigned when
            you submit. It stays out of the catalog until a press manager approves it.
          </p>
          <div className="grid-3">
            <label>
              Raw material
              <input
                type="text"
                value={materialForm.name}
                onChange={(e) => setMaterialField("name", e.target.value)}
                placeholder="e.g. Art card 250gsm"
                required
              />
            </label>
            <label>
              Date
              <input
                type="date"
                value={materialForm.date}
                onChange={(e) => setMaterialField("date", e.target.value)}
                required
              />
            </label>
            <label>
              Closing balance
              <input
                type="text"
                value={fmt(materialClosing)}
                readOnly
                className={materialClosing < 0 ? "neg" : ""}
              />
            </label>
          </div>
          <div className="grid-3">
            <label>
              In
              <input
                type="number"
                min="0"
                step="1"
                value={materialForm.inbound}
                onChange={(e) => setMaterialField("inbound", e.target.value)}
              />
            </label>
            <label>
              Out
              <input
                type="number"
                min="0"
                step="1"
                value={materialForm.outbound}
                onChange={(e) => setMaterialField("outbound", e.target.value)}
              />
            </label>
            <label>
              Remark
              <select
                value={materialForm.remark}
                onChange={(e) => setMaterialField("remark", e.target.value)}
              >
                {TRANSACTION_REMARKS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="actions">
            <button
              type="submit"
              disabled={materialBusy || materialClosing < 0 || !materialForm.name.trim()}
            >
              {materialBusy ? "Submitting…" : "Submit for approval"}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => setShowNewMaterial(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <form className="entry-card" onSubmit={onSubmit}>
        <div className="grid-3">
          <label>
            Date
            <input
              type="date"
              value={form.date}
              onChange={(e) => setField("date", e.target.value)}
              required
            />
          </label>
        </div>

        <div className="grid-3">
          <label>
            Material item
            <SearchableSelect
              options={productOptions}
              value={form.productName}
              onChange={(name) => setField("productName", name)}
              placeholder="Search materials…"
              required
            />
          </label>
          <label>
            Opening balance
            <input type="text" value={fmt(openingBalance)} readOnly />
          </label>
          <label>
            Closing balance
            <input
              type="text"
              value={fmt(closing)}
              readOnly
              className={closing < 0 ? "neg" : ""}
            />
          </label>
        </div>

        <div className="grid-3">
          <label>
            In
            <input
              type="number"
              min="0"
              step="1"
              value={form.inbound}
              onChange={(e) => setField("inbound", e.target.value)}
            />
          </label>
          <label>
            Out
            <input
              type="number"
              min="0"
              step="1"
              value={form.outbound}
              onChange={(e) => setField("outbound", e.target.value)}
            />
          </label>
          <label>
            Remark
            <select
              value={form.remark}
              onChange={(e) => setField("remark", e.target.value)}
            >
              {TRANSACTION_REMARKS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error ? <p className="alert">{error}</p> : null}
        {notice ? <p className="ok">{notice}</p> : null}

        <div className="actions">
          <button type="submit" disabled={busy || closing < 0 || !form.productName}>
            {editingId ? "Submit edit for approval" : "Post transaction"}
          </button>
          {editingId ? (
            <button type="button" className="ghost" onClick={resetForm}>
              Cancel edit
            </button>
          ) : null}
        </div>
      </form>

      <MovementUpload
        company={COMPANY}
        date={form.date}
        scopeReady
        onSuccess={() => {
          loadRecords().catch((err) => setError(err.message));
          loadPendingMaterials().catch((err) => setError(err.message));
        }}
      />

      {pendingMaterials.length > 0 ? (
        <section className="table-wrap">
          <div className="section-head">
            <h2>Awaiting press manager</h2>
            <span>{pendingMaterials.length} new materials</span>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Stock ID</th>
                  <th>Date</th>
                  <th>Material</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>Closing</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pendingMaterials.map((row) => (
                  <tr key={row._id}>
                    <td className="stock-id">{row.stockId}</td>
                    <td>{String(row.date).slice(0, 10)}</td>
                    <td>{row.name}</td>
                    <td>{fmt(row.inbound)}</td>
                    <td>{fmt(row.outbound)}</td>
                    <td className="num-strong">{fmt(row.closingBalance)}</td>
                    <td>
                      <span className="status-pill status-pill--pending">
                        Awaiting approval
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="table-wrap">
        <div className="section-head">
          <h2>Your transactions</h2>
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
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {listLoading && records.length === 0 ? (
                <tr>
                  <td colSpan={10} className="hint">
                    Loading transactions…
                  </td>
                </tr>
              ) : pageGroups.length === 0 ? (
                <tr>
                  <td colSpan={10} className="hint">
                    {appliedStockId
                      ? "No material matches that search."
                      : `No transactions in ${formatMonth(month) || "this month"}.`}
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
                        <td>
                          {group.pending ? (
                            <span className="status-pill status-pill--pending">
                              Awaiting CFO
                            </span>
                          ) : (
                            <span className="hint">Approved</span>
                          )}
                        </td>
                        <td className="hint">Open</td>
                      </tr>
                      {open
                        ? group.rows.map((row) => (
                            <tr
                              key={row._id}
                              className={`txn-child${row.pendingApproval ? " row-pending" : ""}`}
                            >
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
                              <td>
                                {row.pendingApproval ? (
                                  <span className="status-pill status-pill--pending">
                                    Awaiting CFO
                                  </span>
                                ) : (
                                  <span className="hint">Approved</span>
                                )}
                              </td>
                              <td className="row-actions">
                                <button
                                  type="button"
                                  className="text-btn"
                                  disabled={row.pendingApproval}
                                  onClick={() => edit(row)}
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  className="text-btn danger"
                                  onClick={() => remove(row._id)}
                                >
                                  Delete
                                </button>
                              </td>
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
