import { useEffect, useState } from "react";
import { api } from "../api";
import {
  ACCESSIBLE_LOCATIONS,
  COMPANY_OPTIONS,
  companyLabel,
  isLocationlessCompany,
} from "../constants/companies";

const PAGE_SIZE = 50;

function fmt(value) {
  return Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
}

export function AccountantInventory() {
  const [company, setCompany] = useState("accessible");
  const [location, setLocation] = useState("HO");
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isLocationless = isLocationlessCompany(company);
  const scopeReady = isLocationless || Boolean(location);

  async function loadList(nextPage = page, nextSearch = appliedSearch) {
    if (!scopeReady) return;

    setLoading(true);
    setError("");
    try {
      const params = {
        page: nextPage,
        limit: PAGE_SIZE,
        search: nextSearch,
        company,
      };
      if (!isLocationless) params.location = location;

      const data = await api.myInventory(params);
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
    if (!scopeReady) return;
    loadList(1, appliedSearch).catch((err) => setError(err.message));
  }, [company, location, appliedSearch, scopeReady]);

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
          <p className="eyebrow">Accountant · CFO department</p>
          <h1>Inventory</h1>
        </div>
        <p className="lede tight">
          View live stock balances for any company and location. To update a balance,
          go to <strong>Stock movement</strong> and post an In or Out transaction.
        </p>
      </header>

      <form className="filter-bar" onSubmit={(e) => e.preventDefault()}>
        <label>
          Company
          <select value={company} onChange={(e) => setCompany(e.target.value)}>
            {COMPANY_OPTIONS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        {!isLocationless ? (
          <label>
            Location
            <select value={location} onChange={(e) => setLocation(e.target.value)}>
              {ACCESSIBLE_LOCATIONS.map((loc) => (
                <option key={loc} value={loc}>
                  {loc}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </form>

      <section className="table-wrap">
        <div className="section-head">
          <h2>
            {companyLabel(company, { short: true })}
            {!isLocationless ? ` · ${location}` : ""} — {isLocationless ? "All items" : "All books"}
          </h2>
          <span>{total.toLocaleString()} products</span>
        </div>

        <form className="list-toolbar" onSubmit={onSearch}>
          <input
            type="search"
            placeholder={isLocationless ? "Search items…" : "Search book names…"}
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
                    <th>{isLocationless ? "Item Name" : "BookName"}</th>
                    <th>Opening</th>
                    <th>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product, index) => (
                    <tr key={product._id || product.name}>
                      <td>{start + index}</td>
                      <td>{product.name}</td>
                      <td>{fmt(product.openingBalance)}</td>
                      <td className="num-strong">{fmt(product.balance)}</td>
                    </tr>
                  ))}
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
              ? `No products match "${appliedSearch}".`
              : "No products in the catalog yet. Ask CFO to upload the catalogue."}
          </p>
        )}
      </section>
    </div>
  );
}
