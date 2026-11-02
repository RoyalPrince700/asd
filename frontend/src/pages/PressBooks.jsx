import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { useDialog } from "../context/DialogContext.jsx";

const PAGE_SIZE = 50;

const COPY = {
  wip: {
    title: "Work in progress",
    lede: "Add each title still in production. Enter the title, the quantity on hand, and the cost per unit.",
    monitorLede:
      "Titles still in production, as recorded by Press staff. Download the current list as Word or Excel.",
    empty: "No work in progress yet. Add a title above.",
    monitorEmpty: "No work in progress yet.",
    addLabel: "Add title",
  },
  finished: {
    title: "Finished books",
    lede: "Add each finished book. Enter the title, the quantity on hand, and the cost per unit.",
    monitorLede:
      "Finished books recorded by Press staff. Download the current list as Word or Excel.",
    empty: "No finished books yet. Add a title above.",
    monitorEmpty: "No finished books yet.",
    addLabel: "Add book",
  },
};

const emptyForm = {
  title: "",
  quantity: "",
  costPerUnit: "",
};

function n(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

function qty(value) {
  return Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

function money(value) {
  return `₦${Number(value || 0).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function PressBooks({ category, readOnly = false, embedded = false, eyebrow = "Press" }) {
  const copy = COPY[category];
  const { confirm, toast } = useDialog();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState("");
  const [error, setError] = useState("");

  const lineTotal = n(form.quantity) * n(form.costPerUnit);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((item) => item.title.toLowerCase().includes(query));
  }, [items, search]);

  const totals = useMemo(
    () =>
      filtered.reduce(
        (sum, item) => {
          sum.quantity += item.quantity;
          sum.value += item.totalValue;
          return sum;
        },
        { quantity: 0, value: 0 }
      ),
    [filtered]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const end = Math.min(safePage * PAGE_SIZE, filtered.length);
  const pageItems = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await api.pressBooks({ category });
      setItems(data.items || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setForm(emptyForm);
    setEditingId(null);
    setSearch("");
    setPage(1);
    load();
  }, [category]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function startEdit(item) {
    setEditingId(item.id);
    setForm({
      title: item.title,
      quantity: String(item.quantity),
      costPerUnit: String(item.costPerUnit),
    });
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const payload = {
      category,
      title: form.title.trim(),
      quantity: n(form.quantity),
      costPerUnit: n(form.costPerUnit),
    };
    try {
      if (editingId) {
        await api.updatePressBook(editingId, payload);
        toast({ message: "Title updated.", type: "success" });
      } else {
        await api.createPressBook(payload);
        toast({ message: "Title added.", type: "success" });
      }
      resetForm();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(item) {
    const ok = await confirm({
      title: `Remove ${item.title}?`,
      message: `This removes it from ${copy.title}.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    setError("");
    try {
      await api.deletePressBook(item.id);
      if (editingId === item.id) resetForm();
      toast({ message: "Title removed.", type: "success" });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function download(type) {
    setDownloading(type);
    setError("");
    try {
      await api.downloadPressBooks(type, category);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading("");
    }
  }

  const downloads = readOnly ? (
    <div className="txn-download">
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
  ) : null;

  const table = (
    <section className="table-wrap">
      <div className="section-head">
        <h2>{copy.title}</h2>
        <span>
          {filtered.length.toLocaleString()} titles · Qty {qty(totals.quantity)} · {money(totals.value)}
        </span>
      </div>
      {embedded ? <p className="hint">{copy.monitorLede}</p> : null}

      <form className="list-toolbar" onSubmit={(e) => e.preventDefault()}>
        <input
          type="search"
          placeholder="Search titles…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        {search ? (
          <button type="button" className="ghost" onClick={() => setSearch("")}>
            Clear
          </button>
        ) : null}
        {downloads}
      </form>
      {readOnly && error ? <p className="alert">{error}</p> : null}

      {loading ? (
        <p className="hint empty-hint">Loading…</p>
      ) : pageItems.length ? (
        <>
          <div className="table-scroll wide-table">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Title</th>
                  <th>Quantity</th>
                  <th>Cost per unit</th>
                  <th>Total</th>
                  <th>Added by</th>
                  {readOnly ? null : <th />}
                </tr>
              </thead>
              <tbody>
                {pageItems.map((item, index) => (
                  <tr key={item.id}>
                    <td>{start + index}</td>
                    <td>{item.title}</td>
                    <td>{qty(item.quantity)}</td>
                    <td>{money(item.costPerUnit)}</td>
                    <td className="num-strong">{money(item.totalValue)}</td>
                    <td>{item.createdBy?.name || "—"}</td>
                    {readOnly ? null : (
                      <td className="row-actions">
                        <button type="button" className="text-btn" onClick={() => startEdit(item)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-btn danger"
                          onClick={() => remove(item)}
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <span>
              Showing {start}–{end} of {filtered.length.toLocaleString()}
              {search.trim() ? ` matching "${search.trim()}"` : ""}
            </span>
            <div className="pagination-actions">
              <button
                type="button"
                className="ghost"
                disabled={safePage <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                Previous
              </button>
              <span>
                Page {safePage} of {totalPages}
              </span>
              <button
                type="button"
                className="ghost"
                disabled={safePage >= totalPages}
                onClick={() => setPage((current) => current + 1)}
              >
                Next
              </button>
            </div>
          </div>
        </>
      ) : (
        <p className="hint empty-hint">
          {search.trim()
            ? `No titles match "${search.trim()}".`
            : readOnly
              ? copy.monitorEmpty
              : copy.empty}
        </p>
      )}
    </section>
  );

  if (embedded) return table;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{copy.title}</h1>
          <p className="lede tight">{readOnly ? copy.monitorLede : copy.lede}</p>
        </div>
      </header>

      {readOnly ? null : (
        <form className="entry-card" onSubmit={onSubmit}>
          <div className="section-head">
            <h2>{editingId ? "Edit title" : copy.addLabel}</h2>
          </div>
          {error ? <p className="alert">{error}</p> : null}
          <div className="grid-3">
            <label>
              Title
              <input
                type="text"
                value={form.title}
                onChange={(e) => setField("title", e.target.value)}
                placeholder={category === "finished" ? "e.g. English Book 1" : "e.g. English Book 1 — printing"}
                maxLength={200}
                required
              />
            </label>
            <label>
              Quantity
              <input
                type="number"
                min="0"
                step="1"
                value={form.quantity}
                onChange={(e) => setField("quantity", e.target.value)}
                required
              />
            </label>
            <label>
              Cost per unit (₦)
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.costPerUnit}
                onChange={(e) => setField("costPerUnit", e.target.value)}
                required
              />
            </label>
          </div>
          <p className="hint">Line total: {money(lineTotal)}</p>
          <div className="actions">
            <button type="submit" disabled={busy || !form.title.trim()}>
              {busy ? "Saving…" : editingId ? "Save changes" : copy.addLabel}
            </button>
            {editingId ? (
              <button type="button" className="ghost" onClick={resetForm}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      )}

      {table}
    </div>
  );
}

export function PressWorkInProgress() {
  return <PressBooks category="wip" />;
}

export function PressFinishedBooks() {
  return <PressBooks category="finished" />;
}

export function AccountantWorkInProgress() {
  return <PressBooks category="wip" readOnly eyebrow="Accountant" />;
}

export function AccountantFinishedBooks() {
  return <PressBooks category="finished" readOnly eyebrow="Accountant" />;
}

export function AccountantPressBooks({ category }) {
  return <PressBooks category={category} readOnly embedded />;
}
