import { useEffect, useState } from "react";
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
  byCategory: [],
  byDate: [],
};

export function CfoHome() {
  const [filters, setFilters] = useState({
    productName: "",
    category: "",
    from: "",
    to: "",
  });
  const [applied, setApplied] = useState({
    productName: "",
    category: "",
    from: "",
    to: "",
  });
  const [summary, setSummary] = useState(emptySummary);
  const [records, setRecords] = useState([]);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState("");

  async function load(params = applied) {
    const [sum, rec, prod, cats] = await Promise.all([
      api.summary(params),
      api.records(params),
      api.products(),
      api.categories(),
    ]);
    setSummary(sum);
    setRecords(rec.records);
    setProducts(prod.products);
    setCategories(cats.categories);
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

  const t = summary.totals;

  return (
    <div className="page">
      <header className="page-head split">
        <div>
          <p className="eyebrow">Chief Financial Officer</p>
          <h1>Stock position</h1>
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
          Product
          <select
            value={filters.productName}
            onChange={(e) =>
              setFilters((p) => ({ ...p, productName: e.target.value }))
            }
          >
            <option value="">All products</option>
            {products.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Category
          <select
            value={filters.category}
            onChange={(e) =>
              setFilters((p) => ({ ...p, category: e.target.value }))
            }
          >
            <option value="">All categories</option>
            {categories.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
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
          value={products.length.toLocaleString()}
          hint="Uploaded by CFO"
        />
        <Kpi
          label="Categories"
          value={categories.length.toLocaleString()}
          hint="Active groupings"
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
          </div>
        </article>
        <article className="panel">
          <h2>Closing by category</h2>
          <div className="chart">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={summary.byCategory}>
                <CartesianGrid stroke="#e7e0d4" vertical={false} />
                <XAxis dataKey="category" tick={{ fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={70} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="closingBalance" name="Closing balance" fill="#132337" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </article>
      </section>

      <section className="table-wrap">
        <div className="section-head">
          <h2>All ledger lines</h2>
          <span>Live feed of clerk postings</span>
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
                <th>Clerk</th>
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
                  <td>{row.enteredBy?.name || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
