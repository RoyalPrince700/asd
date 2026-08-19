import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { COMPANY_OPTIONS, ACCESSIBLE_LOCATIONS, companyLabel, isLocationlessCompany } from "../constants/companies";
import { enteredByLabel } from "../utils/role.js";

const PAGE_SIZE = 50;

function fmt(value) {
  return Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

function filtersFromSearch(searchParams) {
  return {
    stockId: searchParams.get("stockId") || "",
    productName: searchParams.get("productName") || "",
    company: searchParams.get("company") || "",
    location: searchParams.get("location") || "",
    from: searchParams.get("from") || "",
    to: searchParams.get("to") || "",
  };
}

export function CfoLedger() {
  const [searchParams] = useSearchParams();
  const initialFilters = filtersFromSearch(searchParams);
  const [filters, setFilters] = useState(initialFilters);
  const [applied, setApplied] = useState(initialFilters);
  const [records, setRecords] = useState([]);
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState("");

  const filteredProducts = useMemo(() => {
    if (!filters.company) return products;
    return products.filter((product) => product.company === filters.company);
  }, [products, filters.company]);

  async function loadList(nextPage = page, params = applied) {
    setLoading(true);
    setError("");
    try {
      const [rec, prod] = await Promise.all([
        api.records({ ...params, page: nextPage, limit: PAGE_SIZE }),
        api.products(),
      ]);
      setRecords(rec.records);
      setTotal(rec.total ?? rec.records.length);
      setPage(rec.page ?? nextPage);
      setTotalPages(rec.totalPages ?? 1);
      setProducts(prod.products);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadList(1).catch((err) => setError(err.message));
  }, []);

  function applyFilters(e) {
    e.preventDefault();
    setApplied(filters);
    loadList(1, filters).catch((err) => setError(err.message));
  }

  async function download(type) {
    setDownloading(type);
    setError("");
    try {
      await api.downloadLedgerReport(type, applied);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading("");
    }
  }

  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="page">
      <header className="page-head split">
        <div>
          <p className="eyebrow">Chief Financial Officer</p>
          <h1>Ledger lines</h1>
          <p className="lede tight">
            Live feed of clerk postings. Filter by stock ID, company, product, location, or date range,
            then export the full listing.
          </p>
        </div>
        <div className="export-row">
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
      </header>

      <form className="filter-bar" onSubmit={applyFilters}>
        <label>
          Stock ID
          <input
            type="search"
            placeholder="STK-000001"
            value={filters.stockId}
            onChange={(e) =>
              setFilters((p) => ({ ...p, stockId: e.target.value }))
            }
          />
        </label>
        <label>
          Company
          <select
            value={filters.company}
            onChange={(e) =>
              setFilters((p) => ({
                ...p,
                company: e.target.value,
                productName: "",
                location: isLocationlessCompany(e.target.value) ? "" : p.location,
              }))
            }
          >
            <option value="">All companies</option>
            {COMPANY_OPTIONS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Product
          <select
            value={filters.productName}
            onChange={(e) =>
              setFilters((p) => ({ ...p, productName: e.target.value }))
            }
          >
            <option value="">All products</option>
            {filteredProducts.map((product) => (
              <option key={`${product.company}-${product.name}`} value={product.name}>
                {product.name}
              </option>
            ))}
          </select>
        </label>
        {!isLocationlessCompany(filters.company) ? (
        <label>
          Location
          <select
            value={filters.location}
            onChange={(e) =>
              setFilters((p) => ({ ...p, location: e.target.value }))
            }
          >
            <option value="">All locations</option>
            {ACCESSIBLE_LOCATIONS.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </label>
        ) : null}
        <label>
          From
          <input
            type="date"
            value={filters.from}
            onChange={(e) => setFilters((p) => ({ ...p, from: e.target.value }))}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={filters.to}
            onChange={(e) => setFilters((p) => ({ ...p, to: e.target.value }))}
          />
        </label>
        <button type="submit">Apply</button>
      </form>

      {error ? <p className="alert">{error}</p> : null}

      <section className="table-wrap">
        <div className="section-head">
          <h2>All ledger lines</h2>
          <span>{total.toLocaleString()} records</span>
        </div>

        {loading ? (
          <p className="hint empty-hint">Loading ledger lines…</p>
        ) : records.length ? (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Stock ID</th>
                    <th>Date</th>
                    <th>Company</th>
                    <th>Location</th>
                    <th>Product</th>
                    <th>Opening</th>
                    <th>In</th>
                    <th>Out</th>
                    <th>Closing</th>
                    <th>Posted by</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((row) => (
                    <tr key={row._id}>
                      <td className="stock-id">{row.stockId || "—"}</td>
                      <td>{row.date.slice(0, 10)}</td>
                      <td>{companyLabel(row.company, { short: true })}</td>
                      <td>{row.location || "—"}</td>
                      <td>{row.productName}</td>
                      <td>{fmt(row.openingBalance)}</td>
                      <td>{fmt(row.inbound)}</td>
                      <td>{fmt(row.outbound)}</td>
                      <td className="num-strong">{fmt(row.closingBalance)}</td>
                      <td>{enteredByLabel(row.enteredBy)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pagination">
              <span>
                Showing {start}–{end} of {total.toLocaleString()}
              </span>
              <div className="pagination-actions">
                <button
                  type="button"
                  className="ghost"
                  disabled={page <= 1 || loading}
                  onClick={() => loadList(page - 1, applied)}
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
                  onClick={() => loadList(page + 1, applied)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : (
          <p className="hint empty-hint">
            No ledger lines match the current filters.{" "}
            <Link to="/overview">Return to overview</Link>
          </p>
        )}
      </section>
    </div>
  );
}
