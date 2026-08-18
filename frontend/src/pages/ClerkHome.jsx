import { useEffect, useMemo, useState } from "react";
import { api } from "../api";

const emptyForm = {
  productName: "",
  category: "",
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
    maximumFractionDigits: 2,
  });
}

export function ClerkHome() {
  const [form, setForm] = useState(emptyForm);
  const [records, setRecords] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [openingBalance, setOpeningBalance] = useState(0);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const closing = useMemo(
    () => openingBalance + n(form.inbound) - n(form.outbound),
    [openingBalance, form.inbound, form.outbound]
  );

  async function load() {
    const [rec, prod, cats] = await Promise.all([
      api.records(),
      api.products(),
      api.categories(),
    ]);
    setRecords(rec.records);
    setProducts(prod.products);
    setCategories(cats.categories);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!form.productName || !form.category) {
      setOpeningBalance(0);
      return;
    }

    api
      .stockLevel(form.productName, form.category, editingId)
      .then((data) => setOpeningBalance(data.openingBalance))
      .catch((err) => setError(err.message));
  }, [form.productName, form.category, editingId]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const payload = {
        ...form,
        inbound: n(form.inbound),
        outbound: n(form.outbound),
        stockReceived: 0,
        stockOut: 0,
      };
      if (editingId) {
        await api.updateRecord(editingId, payload);
        setNotice("Record updated.");
      } else {
        await api.createRecord(payload);
        setNotice("Record posted to the ledger.");
      }
      setForm({ ...emptyForm, date: form.date });
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function edit(row) {
    setEditingId(row._id);
    setForm({
      productName: row.productName,
      category: row.category || "",
      date: row.date.slice(0, 10),
      inbound: String(row.inbound),
      outbound: String(row.outbound),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function remove(id) {
    if (!window.confirm("Delete this stock record?")) return;
    await api.deleteRecord(id);
    if (editingId === id) {
      setEditingId(null);
      setForm(emptyForm);
    }
    await load();
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Data clerk</p>
          <h1>Stock movement dashboard</h1>
        </div>
        <p className="lede tight">
          Select a product and category, then record stock in and out. Opening
          quantity updates automatically from prior entries.
        </p>
      </header>

      <form className="entry-card" onSubmit={onSubmit}>
        <div className="grid-3">
          <label>
            Product
            <select
              value={form.productName}
              onChange={(e) => setField("productName", e.target.value)}
              required
            >
              <option value="">Select a product…</option>
              {products.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
              {editingId &&
              form.productName &&
              !products.includes(form.productName) ? (
                <option value={form.productName}>{form.productName}</option>
              ) : null}
            </select>
          </label>
          <label>
            Category
            <select
              value={form.category}
              onChange={(e) => setField("category", e.target.value)}
              required
              disabled={!form.productName}
            >
              <option value="">Select a category…</option>
              {categories.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
              {editingId &&
              form.category &&
              !categories.includes(form.category) ? (
                <option value={form.category}>{form.category}</option>
              ) : null}
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
            Opening quantity
            <input type="text" value={fmt(openingBalance)} readOnly />
          </label>
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

        <div className="closing-bar">
          <span>Closing quantity</span>
          <strong className={closing < 0 ? "neg" : ""}>{fmt(closing)}</strong>
        </div>

        {error ? <p className="alert">{error}</p> : null}
        {notice ? <p className="ok">{notice}</p> : null}

        <div className="actions">
          <button type="submit" disabled={busy || closing < 0}>
            {editingId ? "Save changes" : "Post record"}
          </button>
          {editingId ? (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm);
              }}
            >
              Cancel edit
            </button>
          ) : null}
        </div>
      </form>

      <section className="table-wrap">
        <div className="section-head">
          <h2>Your posted records</h2>
          <span>{records.length} rows</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Product</th>
                <th>Category</th>
                <th>Opening</th>
                <th>In</th>
                <th>Out</th>
                <th>Closing</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {records.map((row) => (
                <tr key={row._id}>
                  <td>{row.date.slice(0, 10)}</td>
                  <td>{row.productName}</td>
                  <td>{row.category || "—"}</td>
                  <td>{fmt(row.openingBalance)}</td>
                  <td>{fmt(row.inbound)}</td>
                  <td>{fmt(row.outbound)}</td>
                  <td className="num-strong">{fmt(row.closingBalance)}</td>
                  <td className="row-actions">
                    <button type="button" className="text-btn" onClick={() => edit(row)}>
                      Edit
                    </button>
                    <button type="button" className="text-btn danger" onClick={() => remove(row._id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
