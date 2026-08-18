import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { SearchableSelect } from "../components/SearchableSelect.jsx";
import { useDialog } from "../context/DialogContext.jsx";
import {
  ACCESSIBLE_LOCATIONS,
  COMPANY_OPTIONS,
  companyLabel,
} from "../constants/companies";

const emptyForm = {
  productName: "",
  date: new Date().toISOString().slice(0, 10),
  inbound: "",
  outbound: "",
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

export function AccountantMovement() {
  const { confirm, toast } = useDialog();

  const [company, setCompany] = useState("accessible");
  const [location, setLocation] = useState("HO");
  const [form, setForm] = useState(emptyForm);
  const [products, setProducts] = useState([]);
  const [records, setRecords] = useState([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const isTrifone = company === "trifone";
  const scopeReady = isTrifone || Boolean(location);

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

  async function loadRecords() {
    if (!scopeReady) return;
    const params = { company };
    if (!isTrifone) params.location = location;
    const data = await api.records(params);
    setRecords(data.records);
  }

  async function loadProducts() {
    if (!scopeReady) return;
    const data = await api.products({ company });
    setProducts(data.products);
  }

  useEffect(() => {
    if (!scopeReady) return;
    loadProducts().catch((err) => setError(err.message));
    loadRecords().catch((err) => setError(err.message));
  }, [company, location, scopeReady]);

  useEffect(() => {
    if (!form.productName || !scopeReady) {
      setOpeningBalance(0);
      return;
    }

    api
      .stockLevel(
        form.productName,
        company,
        editingId,
        isTrifone ? undefined : location
      )
      .then((data) => setOpeningBalance(data.openingBalance))
      .catch((err) => setError(err.message));
  }, [form.productName, company, location, editingId, isTrifone, scopeReady]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function resetForm() {
    setForm({ ...emptyForm, date: form.date });
    setEditingId(null);
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (!scopeReady) return;

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
        stockReceived: 0,
        stockOut: 0,
      };
      if (!isTrifone) payload.location = location;

      if (editingId) {
        const result = await api.updateRecord(editingId, payload);
        setNotice(result.message || "Edit saved and sent to CFO for approval.");
      } else {
        await api.createRecord(payload);
        setNotice("Transaction posted.");
      }

      resetForm();
      await loadRecords();
      toast({
        message: editingId
          ? "Edit saved. Awaiting CFO approval."
          : "Transaction posted.",
        type: "success",
      });
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
          <p className="eyebrow">Accountant · CFO department</p>
          <h1>Stock movement</h1>
        </div>
        <p className="lede tight">
          Select a company and location, then post In or Out on behalf of any clerk.
          Edits to existing transactions apply immediately but are sent to the CFO
          for approval before they become permanent.
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
              {COMPANY_OPTIONS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          {!isTrifone ? (
            <label>
              Location
              <select
                value={location}
                onChange={(e) => {
                  setLocation(e.target.value);
                  resetForm();
                }}
              >
                {ACCESSIBLE_LOCATIONS.map((loc) => (
                  <option key={loc} value={loc}>
                    {loc}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
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
            {isTrifone ? "Item" : "Product"}
            <SearchableSelect
              options={productOptions}
              value={form.productName}
              onChange={(name) => setField("productName", name)}
              placeholder={isTrifone ? "Search items…" : "Search books…"}
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
        </div>

        {error ? <p className="alert">{error}</p> : null}
        {notice ? <p className="ok">{notice}</p> : null}

        <div className="actions">
          <button
            type="submit"
            disabled={busy || closing < 0 || !form.productName || !scopeReady}
          >
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
          <h2>
            {companyLabel(company, { short: true })}
            {!isTrifone ? ` · ${location}` : ""} transactions
          </h2>
          <span>{records.length} records</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>{isTrifone ? "Item" : "Product"}</th>
                <th>Opening</th>
                <th>In</th>
                <th>Out</th>
                <th>Closing</th>
                <th>Posted by</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {records.length === 0 ? (
                <tr>
                  <td colSpan={9} className="hint">
                    No transactions for this company and location yet.
                  </td>
                </tr>
              ) : (
                records.map((row) => (
                  <tr key={row._id} className={row.pendingApproval ? "row-pending" : undefined}>
                    <td>{row.date.slice(0, 10)}</td>
                    <td>{row.productName}</td>
                    <td>{fmt(row.openingBalance)}</td>
                    <td>{fmt(row.inbound)}</td>
                    <td>{fmt(row.outbound)}</td>
                    <td className="num-strong">{fmt(row.closingBalance)}</td>
                    <td>
                      {row.enteredBy?.role === "accountant"
                        ? `${row.enteredBy.name} (Accountant)`
                        : row.enteredBy?.name || "—"}
                    </td>
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
