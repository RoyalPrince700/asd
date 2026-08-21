import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { SearchableSelect } from "../components/SearchableSelect.jsx";
import { RemarkTag } from "../components/RemarkTag.jsx";
import { useDialog } from "../context/DialogContext.jsx";
import {
  TRIFONE_ROLE_COMPANY_OPTIONS,
  companyLabel,
} from "../constants/companies";
import {
  DEFAULT_TRANSACTION_REMARK,
  TRANSACTION_REMARKS,
} from "../constants/transactionRemarks.js";
import { enteredByLabel } from "../utils/role.js";

const emptyForm = {
  productName: "",
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

export function TrifoneMovement() {
  const { confirm, toast } = useDialog();

  const [company, setCompany] = useState("trifone");
  const [form, setForm] = useState(emptyForm);
  const [products, setProducts] = useState([]);
  const [records, setRecords] = useState([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [stockIdSearch, setStockIdSearch] = useState("");
  const [appliedStockId, setAppliedStockId] = useState("");

  const closing = useMemo(
    () => openingBalance + n(form.inbound) - n(form.outbound),
    [openingBalance, form.inbound, form.outbound]
  );

  const productOptions = useMemo(() => {
    const names = products.map((product) => product.name);
    if (form.productName && !names.includes(form.productName)) {
      return [form.productName, ...names];
    }
    return names;
  }, [products, form.productName]);

  async function loadRecords(nextStockId = appliedStockId) {
    const params = { company };
    if (nextStockId) params.stockId = nextStockId;
    const data = await api.records(params);
    setRecords(data.records);
  }

  async function loadProducts() {
    const data = await api.products({ company });
    setProducts(data.products);
  }

  useEffect(() => {
    loadProducts().catch((err) => setError(err.message));
    loadRecords().catch((err) => setError(err.message));
  }, [company]);

  useEffect(() => {
    if (!form.productName) {
      setOpeningBalance(0);
      return;
    }

    api
      .stockLevel(form.productName, company, editingId)
      .then((data) => setOpeningBalance(data.openingBalance))
      .catch((err) => setError(err.message));
  }, [form.productName, company, editingId]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
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
        company,
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

      resetForm();
      setStockIdSearch("");
      setAppliedStockId("");
      await loadRecords("");
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
    setCompany(row.company);
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
      message: "Delete this stock transaction?",
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

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Trifone</p>
          <h1>Stock movement</h1>
        </div>
        <p className="lede tight">
          Post In or Out for Trifone Gadgets and Trifone Electronics products.
          Edits are sent to the CFO for approval before they become permanent.
        </p>
      </header>

      <form className="entry-card" onSubmit={onSubmit}>
        <div className="grid-3">
          <label>
            Company
            <select
              value={company}
              onChange={(e) => {
                setCompany(e.target.value);
                resetForm();
              }}
            >
              {TRIFONE_ROLE_COMPANY_OPTIONS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
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
            Item
            <SearchableSelect
              options={productOptions}
              value={form.productName}
              onChange={(name) => setField("productName", name)}
              placeholder="Search items…"
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

      <section className="table-wrap">
        <div className="section-head">
          <h2>{companyLabel(company, { short: true })} transactions</h2>
          <span>{records.length} records</span>
        </div>
        <form
          className="list-toolbar"
          onSubmit={(e) => {
            e.preventDefault();
            const next = stockIdSearch.trim();
            setAppliedStockId(next);
            loadRecords(next).catch((err) => setError(err.message));
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
                loadRecords("").catch((err) => setError(err.message));
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
                <th>Item</th>
                <th>Opening</th>
                <th>In</th>
                <th>Out</th>
                <th>Remark</th>
                <th>Closing</th>
                <th>Posted by</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan={11} className="hint">
                    {appliedStockId
                      ? "No transaction matches that stock ID."
                      : "No transactions for this company yet."}
                  </td>
                </tr>
              ) : (
                records.map((row) => (
                  <tr key={row._id} className={row.pendingApproval ? "row-pending" : undefined}>
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
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
