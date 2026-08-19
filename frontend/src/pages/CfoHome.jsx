import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api";
import { COMPANY_OPTIONS, ACCESSIBLE_LOCATIONS, companyLabel, isLocationlessCompany } from "../constants/companies";

function fmt(value) {
  return Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

const emptySummary = {
  totals: {
    openingBalance: 0,
    inbound: 0,
    outbound: 0,
    stockReceived: 0,
    stockOut: 0,
    closingBalance: 0,
    netMovement: 0,
    recordCount: 0,
  },
  byProduct: [],
  byCompany: [],
  byDate: [],
  productCount: 0,
};

function companiesHint(companies) {
  const labels = companies.map((item) => item.shortLabel);
  if (!labels.length) return "No companies";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

export function CfoHome() {
  const [filters, setFilters] = useState({
    stockId: "",
    productName: "",
    company: "",
    location: "",
    from: "",
    to: "",
  });
  const [applied, setApplied] = useState({
    stockId: "",
    productName: "",
    company: "",
    location: "",
    from: "",
    to: "",
  });
  const [summary, setSummary] = useState(emptySummary);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState("");

  const filteredProducts = useMemo(() => {
    if (!filters.company) return products;
    return products.filter((product) => product.company === filters.company);
  }, [products, filters.company]);

  const catalogProducts = useMemo(() => {
    if (!applied.company) return products;
    return products.filter((product) => product.company === applied.company);
  }, [products, applied.company]);

  const visibleCompanies = useMemo(() => {
    if (!applied.company) return COMPANY_OPTIONS;
    return COMPANY_OPTIONS.filter((item) => item.id === applied.company);
  }, [applied.company]);

  const catalogCount =
    typeof summary.productCount === "number"
      ? summary.productCount
      : catalogProducts.length;

  const scopeLabel = useMemo(() => {
    const parts = [];
    if (applied.company) parts.push(companyLabel(applied.company));
    if (applied.location) parts.push(applied.location);
    if (applied.productName) parts.push(applied.productName);
    if (applied.stockId) parts.push(applied.stockId);
    if (applied.from || applied.to) {
      parts.push(`${applied.from || "…"} – ${applied.to || "…"}`);
    }
    return parts.length ? parts.join(" · ") : "All companies";
  }, [applied]);

  const chartCompanies = useMemo(
    () =>
      summary.byCompany.map((row) => ({
        ...row,
        label: companyLabel(row.company, { short: true }),
      })),
    [summary.byCompany]
  );

  const companyScoped = Boolean(applied.company);

  const barChartData = useMemo(() => {
    if (!companyScoped) return chartCompanies;
    return summary.byProduct
      .slice()
      .sort((a, b) => b.closingBalance - a.closingBalance)
      .slice(0, 12)
      .map((row) => ({
        ...row,
        label: row.productName,
      }));
  }, [companyScoped, chartCompanies, summary.byProduct]);

  async function load(params = applied) {
    const [sum, prod] = await Promise.all([
      api.summary(params),
      api.products(),
    ]);
    setSummary(sum);
    setProducts(prod.products);
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  function applyFilters(e) {
    e.preventDefault();
    setApplied(filters);
    load(filters).catch((err) => setError(err.message));
  }

  async function download(type) {
    setDownloading(type);
    setError("");
    try {
      await api.downloadReport(type, applied);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading("");
    }
  }

  const ledgerHref = useMemo(() => {
    const entries = Object.entries(applied).filter(([, value]) => value);
    if (!entries.length) return "/ledger";
    return `/ledger?${new URLSearchParams(entries).toString()}`;
  }, [applied]);

  const t = summary.totals;

  return (
    <div className="page">
      <header className="page-head split">
        <div>
          <p className="eyebrow">Chief Financial Officer</p>
          <h1>Stock position</h1>
          <p className="lede tight">{scopeLabel}</p>
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

      <section className="kpi-grid">
        <Kpi
          label="Products in catalog"
          value={catalogCount.toLocaleString()}
          hint={
            applied.company
              ? companyLabel(applied.company, { short: true })
              : "Uploaded by CFO"
          }
        />
        <Kpi
          label="Companies"
          value={visibleCompanies.length.toLocaleString()}
          hint={companiesHint(visibleCompanies)}
        />
        <Kpi label="Opening" value={fmt(t.openingBalance)} />
        <Kpi label="In" value={fmt(t.inbound)} tone="up" />
        <Kpi label="Out" value={fmt(t.outbound)} tone="down" />
        <Kpi
          label="Closing"
          value={fmt(t.closingBalance)}
          hint={`${t.recordCount} records · net ${fmt(t.netMovement)}`}
          featured
        />
      </section>

      <section className="chart-grid">
        <article className="panel">
          <h2>Daily movement</h2>
          <div className="chart">
            {summary.byDate.length ? (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={summary.byDate}>
                  <CartesianGrid stroke="#e7e0d4" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="inbound" name="In" stroke="#1f6b4a" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="outbound" name="Out" stroke="#9a3412" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="closingBalance" name="Closing" stroke="#132337" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="hint empty-hint">No movement data for this filter.</p>
            )}
          </div>
        </article>
        <article className="panel">
          <h2>{companyScoped ? "Closing by product" : "Closing by company"}</h2>
          <div className="chart">
            {barChartData.length ? (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={barChartData}>
                  <CartesianGrid stroke="#e7e0d4" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={70} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="closingBalance" name="Closing balance" fill="#132337" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="hint empty-hint">No closing balances for this filter.</p>
            )}
          </div>
        </article>
      </section>

      <section className="panel ledger-link-card">
        <div className="section-head">
          <h2>Ledger lines</h2>
          <Link to={ledgerHref} className="text-btn">
            View all ledger lines →
          </Link>
        </div>
        <p className="hint">
          Browse, filter by stock ID, and export the full clerk posting history on the dedicated ledger page.
        </p>
      </section>
    </div>
  );
}

function Kpi({ label, value, hint, tone, featured }) {
  return (
    <article className={`kpi ${featured ? "featured" : ""} ${tone || ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small>{hint}</small> : null}
    </article>
  );
}
