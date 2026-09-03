import { useEffect, useState } from "react";
import { api } from "../api";

const PAGE_SIZE = 50;
const LOW_STOCK_THRESHOLD = 10;

function fmt(value) {
  return Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
}

function isLowStock(value) {
  return Number(value || 0) < LOW_STOCK_THRESHOLD;
}

export function PressInventory() {
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadList(nextPage = page, nextSearch = appliedSearch) {
    setLoading(true);
    setError("");
    try {
      const data = await api.myInventory({
        page: nextPage,
        limit: PAGE_SIZE,
        search: nextSearch,
        company: "press",
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
    loadList(1, appliedSearch).catch((err) => setError(err.message));
  }, [appliedSearch]);

  function onSearch(e) {
    e.preventDefault();
    setAppliedSearch(search.trim());
  }

  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);
  const pageTotal = products.reduce((sum, row) => sum + (row.balance || 0), 0);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Press</p>
          <h1>Raw materials inventory</h1>
        </div>
        <p className="lede tight">
          View live stock for Press raw materials. To update balances, post In or
          Out on the Raw materials movement page.
        </p>
      </header>

      <section className="table-wrap">
        <div className="section-head">
          <h2>Press — All materials</h2>
          <span>{total.toLocaleString()} items</span>
        </div>

        <form className="list-toolbar" onSubmit={onSearch}>
          <input
            type="search"
            placeholder="Search materials…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit">Search</button>
          {appliedSearch ? (
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setSearch("");
                setAppliedSearch("");
              }}
            >
              Clear
            </button>
          ) : null}
        </form>

        {error ? <p className="alert">{error}</p> : null}

        {loading ? (
          <p className="hint empty-hint">Loading inventory…</p>
        ) : products.length ? (
          <>
            <div className="table-scroll wide-table">
              <table className="inventory-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Materials Item</th>
                    <th>Opening</th>
                    <th>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product, index) => {
                    const low = isLowStock(product.balance);
                    return (
                      <tr
                        key={product._id || product.name}
                        className={low ? "low-stock-row" : undefined}
                      >
                        <td>{start + index}</td>
                        <td>{product.name}</td>
                        <td>{fmt(product.openingBalance)}</td>
                        <td className="num-strong">
                          <span
                            className={low ? "low-stock-glow" : undefined}
                            title={low ? "Low stock — below 10" : undefined}
                          >
                            {fmt(product.balance)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="pagination">
              <span>
                Showing {start}–{end} of {total.toLocaleString()}
                {appliedSearch ? ` matching "${appliedSearch}"` : ""}
                {" · "}
                Page total: {fmt(pageTotal)}
              </span>
              <div className="pagination-actions">
                <button
                  type="button"
                  className="ghost"
                  disabled={page <= 1 || loading}
                  onClick={() => loadList(page - 1, appliedSearch)}
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
                  onClick={() => loadList(page + 1, appliedSearch)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : (
          <p className="hint empty-hint">
            {appliedSearch
              ? `No materials match "${appliedSearch}".`
              : "No materials in the catalog yet. Ask CFO to upload the Press catalogue."}
          </p>
        )}
      </section>
    </div>
  );
}
