import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { GroupedTransactions } from "../components/GroupedTransactions.jsx";
import { CfoRemarkTag } from "../components/RemarkTag.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { COMPANY_OPTIONS, ACCESSIBLE_LOCATIONS, companyLabel, isLocationlessCompany } from "../constants/companies";
import { roleLabel } from "../utils/role.js";

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
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const initialFilters = filtersFromSearch(searchParams);
  const [filters, setFilters] = useState(initialFilters);
  const [applied, setApplied] = useState(initialFilters);
  const [records, setRecords] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState("");

  const filteredProducts = useMemo(() => {
    if (!filters.company) return products;
    return products.filter((product) => product.company === filters.company);
  }, [products, filters.company]);

  async function loadList(params = applied) {
    setLoading(true);
    setError("");
    try {
      const requestParams = { ...params };
      delete requestParams.stockId;
      const [rec, prod] = await Promise.all([
        api.records(requestParams),
        api.products(),
      ]);
      setRecords(rec.records || []);
      setProducts(prod.products);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadList().catch((err) => setError(err.message));
  }, []);

  function applyFilters(e) {
    e.preventDefault();
    setApplied(filters);
    loadList(filters).catch((err) => setError(err.message));
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

  return (
    <div className="page">
      <header className="page-head split">
        <div>
          <p className="eyebrow">{roleLabel(user?.role)}</p>
          <h1>Ledger lines</h1>
          <p className="lede tight">
            Live feed of clerk postings. Each product is listed once for its company
            and location. Open it to see every posting. Filter by stock ID, company,
            product, location, or date range, then export the full listing.
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

      <GroupedTransactions
        title="All ledger lines"
        records={records}
        loading={loading}
        itemLabel="Product"
        emptyMessage={
          <>
            No ledger lines match the current filters.{" "}
            <Link to="/overview">Return to overview</Link>
          </>
        }
        resetKey={JSON.stringify(applied)}
        initialQuery={applied.stockId}
        showPostedBy
        showCompany
        Remark={CfoRemarkTag}
        decimals={2}
      />
    </div>
  );
}
