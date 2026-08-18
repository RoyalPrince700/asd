import { useEffect, useRef, useState } from "react";
import { api } from "../api";

const PAGE_SIZE = 50;

export function CfoProducts() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [newCategory, setNewCategory] = useState("");
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const fileRef = useRef(null);

  async function loadCategories() {
    const data = await api.categories();
    setCategories(data.categories);
  }

  async function loadList(nextPage = page, nextSearch = appliedSearch) {
    setLoading(true);
    setError("");
    try {
      const data = await api.products({
        page: nextPage,
        limit: PAGE_SIZE,
        search: nextSearch,
      });
      setProducts(data.products);
      setTotal(data.total);
      setPage(data.page);
      setTotalPages(data.totalPages);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCategories().catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    loadList(1, appliedSearch).catch((err) => setError(err.message));
  }, [appliedSearch]);

  function onSearch(e) {
    e.preventDefault();
    setAppliedSearch(search.trim());
  }

  function clearSearch() {
    setSearch("");
    setAppliedSearch("");
  }

  async function onAddCategory(e) {
    e.preventDefault();
    const name = newCategory.trim();
    if (!name) return;

    setError("");
    try {
      await api.createCategory(name);
      setNewCategory("");
      setNotice(`Category "${name}" added.`);
      await loadCategories();
    } catch (err) {
      setError(err.message);
    }
  }

  async function onRemoveCategory(name) {
    if (!window.confirm(`Remove category "${name}"?`)) return;
    setError("");
    try {
      await api.deleteCategory(name);
      setNotice(`Category "${name}" removed.`);
      await loadCategories();
      await loadList(page);
    } catch (err) {
      setError(err.message);
    }
  }

  async function onUpload(e) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose an Excel file first.");
      return;
    }

    if (
      !window.confirm(
        "New products from the file will be added to the catalog. Existing products will be kept. Continue?"
      )
    ) {
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api.uploadProducts(file);
      setNotice(result.message);
      if (fileRef.current) fileRef.current.value = "";
      setPage(1);
      setAppliedSearch("");
      setSearch("");
      await loadList(1, "");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function downloadTemplate() {
    setDownloading(true);
    setError("");
    try {
      await api.downloadProductTemplate();
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading(false);
    }
  }

  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Chief Financial Officer</p>
          <h1>Product catalog</h1>
        </div>
        <p className="lede tight">
          Add categories for clerks to use, then upload product names from Excel.
        </p>
      </header>

      <section className="entry-card">
        <div className="section-head">
          <h2>Categories</h2>
          <span>{categories.length} categories</span>
        </div>
        <form className="category-form" onSubmit={onAddCategory}>
          <input
            type="text"
            placeholder="New category name"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
          />
          <button type="submit">Add category</button>
        </form>
        {categories.length ? (
          <ul className="category-list">
            {categories.map((name) => (
              <li key={name}>
                <span>{name}</span>
                <button
                  type="button"
                  className="text-btn danger"
                  onClick={() => onRemoveCategory(name)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="hint empty-hint">
            Add categories first so clerks can classify products.
          </p>
        )}
      </section>

      <section className="entry-card upload-card">
        <div className="section-head">
          <h2>Upload products</h2>
          <button
            type="button"
            className="ghost"
            disabled={downloading}
            onClick={downloadTemplate}
          >
            {downloading ? "Preparing…" : "Download template"}
          </button>
        </div>

        <form className="upload-form" onSubmit={onUpload}>
          <label className="file-drop">
            <span>Excel file (.xlsx)</span>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            />
          </label>
          <p className="hint">
            We read the Item Name, BookName, or Product Name column from your
            sheet. Clerks assign categories when posting stock.
          </p>

          {notice ? <p className="ok">{notice}</p> : null}

          <div className="actions">
            <button type="submit" disabled={busy}>
              {busy ? "Uploading…" : "Upload product list"}
            </button>
          </div>
        </form>
      </section>

      <section className="table-wrap">
        <div className="section-head">
          <h2>Product list</h2>
          <span>{total.toLocaleString()} products</span>
        </div>

        <form className="list-toolbar" onSubmit={onSearch}>
          <input
            type="search"
            placeholder="Search products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit">Search</button>
          {appliedSearch ? (
            <button type="button" className="ghost" onClick={clearSearch}>
              Clear
            </button>
          ) : null}
        </form>

        {error ? <p className="alert">{error}</p> : null}

        {loading ? (
          <p className="hint empty-hint">Loading products…</p>
        ) : products.length ? (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Product name</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product, index) => (
                    <tr key={product._id || product.name}>
                      <td>{start + index}</td>
                      <td>{product.name || product}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pagination">
              <span>
                Showing {start}–{end} of {total.toLocaleString()}
                {appliedSearch ? ` matching "${appliedSearch}"` : ""}
              </span>
              <div className="pagination-actions">
                <button
                  type="button"
                  className="ghost"
                  disabled={page <= 1 || loading}
                  onClick={() => loadList(page - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  className="ghost"
                  disabled={page >= totalPages || loading}
                  onClick={() => loadList(page + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : (
          <p className="hint empty-hint">
            {appliedSearch
              ? `No products match "${appliedSearch}".`
              : "No products yet. Upload an Excel file to populate the clerk dropdown."}
          </p>
        )}
      </section>
    </div>
  );
}
