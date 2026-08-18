import { useEffect, useMemo, useState } from "react";
import {
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
import { useAuth } from "../context/AuthContext.jsx";
import { companyLabel } from "../constants/companies";
import { staffAssignmentLabel, staffCompany } from "../utils/staff.js";

function fmt(value) {
  return Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: 0,
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
  byDate: [],
  productCount: 0,
};

export function StaffOverview() {
  const { user } = useAuth();
  const assignmentLabel = staffAssignmentLabel(user);
  const company = staffCompany(user);
  const isTrifoneStaff = user?.assignedCompany === "trifone";

  const [filters, setFilters] = useState({
    productName: "",
    from: "",
    to: "",
  });
  const [applied, setApplied] = useState({
    productName: "",
    from: "",
    to: "",
  });
  const [summary, setSummary] = useState(emptySummary);
  const [records, setRecords] = useState([]);
  const [products, setProducts] = useState([]);
  const [error, setError] = useState("");

  const topProducts = useMemo(
    () => summary.byProduct.slice(0, 8),
    [summary.byProduct]
  );

  async function load(params = applied) {
    const [sum, rec, prod] = await Promise.all([
      api.mySummary(params),
      api.records(params),
      api.products({ company }),
    ]);
    setSummary(sum);
    setRecords(rec.records.slice(0, 20));
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

  const t = summary.totals;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Data clerk · {assignmentLabel}</p>
          <h1>Overview</h1>
        </div>
        <p className="lede tight">
          Summary for {companyLabel(company)}
          {!isTrifoneStaff ? ` · location ${assignmentLabel}` : ""}. Tracks
          your posted transactions and movement trends.
        </p>
      </header>

      <form className="filter-bar" onSubmit={applyFilters}>
        <label>
          {isTrifoneStaff ? "Item" : "Product"}
          <select
            value={filters.productName}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, productName: e.target.value }))
            }
          >
            <option value="">All products</option>
            {products.map((product) => (
              <option key={product.name} value={product.name}>
                {product.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          From
          <input
            type="date"
            value={filters.from}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, from: e.target.value }))
            }
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={filters.to}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, to: e.target.value }))
            }
          />
        </label>
        <button type="submit">Apply</button>
      </form>

      {error ? <p className="alert">{error}</p> : null}

      <section className="kpi-grid">
        <Kpi label="Products in catalog" value={fmt(summary.productCount || products.length)} />
        <Kpi label="Transactions" value={fmt(t.recordCount)} />
        <Kpi label="Total In" value={fmt(t.inbound)} tone="up" />
        <Kpi label="Total Out" value={fmt(t.outbound)} tone="down" />
        <Kpi
          label="Net movement"
          value={fmt(t.netMovement)}
          hint={`In ${fmt(t.inbound)} · Out ${fmt(t.outbound)}`}
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
                  <Line
                    type="monotone"
                    dataKey="inbound"
                    name="In"
                    stroke="#1f6b4a"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="outbound"
                    name="Out"
                    stroke="#9a3412"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="hint empty-hint">No movement data for this period.</p>
            )}
          </div>
        </article>

        <article className="panel">
          <h2>Most active products</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>Records</th>
                </tr>
              </thead>
              <tbody>
                {topProducts.length ? (
                  topProducts.map((row) => (
                    <tr key={row.productName}>
                      <td>{row.productName}</td>
                      <td>{fmt(row.inbound)}</td>
                      <td>{fmt(row.outbound)}</td>
                      <td>{fmt(row.recordCount)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="hint">
                      No product activity yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>

      <section className="table-wrap">
        <div className="section-head">
          <h2>Recent transactions</h2>
          <span>Latest 20</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>{isTrifoneStaff ? "Item" : "Product"}</th>
                <th>In</th>
                <th>Out</th>
                <th>Closing</th>
              </tr>
            </thead>
            <tbody>
              {records.length ? (
                records.map((row) => (
                  <tr key={row._id}>
                    <td>{row.date.slice(0, 10)}</td>
                    <td>{row.productName}</td>
                    <td>{fmt(row.inbound)}</td>
                    <td>{fmt(row.outbound)}</td>
                    <td className="num-strong">{fmt(row.closingBalance)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="hint">
                    No transactions yet.
                  </td>
                </tr>
              )}
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
