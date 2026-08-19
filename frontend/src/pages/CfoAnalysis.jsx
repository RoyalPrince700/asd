import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api";
import { COMPANY_OPTIONS, companyLabel } from "../constants/companies";

const CHART_COLORS = ["#132337", "#1f6b4a", "#b08a2d", "#9a3412", "#1c334d", "#57534e"];

const HEALTH_COLORS = {
  outOfStock: "#b42318",
  critical: "#9a3412",
  low: "#b08a2d",
  watch: "#57534e",
  healthy: "#1f6b4a",
};

function fmt(value, decimals = 0) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtMoney(value) {
  return `₦${fmt(value, 0)}`;
}

function truncateLabel(value, max = 14) {
  const text = String(value || "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function renderMarkdown(text) {
  const lines = String(text || "").split("\n");
  return lines.map((line, index) => {
    if (line.startsWith("# ")) {
      return <h2 key={index}>{line.slice(2)}</h2>;
    }
    if (line.startsWith("## ")) {
      return <h3 key={index}>{line.slice(3)}</h3>;
    }
    if (line.startsWith("### ")) {
      return <h4 key={index}>{line.slice(4)}</h4>;
    }
    if (line.startsWith("- **")) {
      const match = line.match(/^- \*\*(.+?)\*\*(.*)$/);
      if (match) {
        return (
          <p key={index} className="md-bullet">
            <strong>{match[1]}</strong>
            {match[2]}
          </p>
        );
      }
    }
    if (line.startsWith("- ")) {
      return (
        <p key={index} className="md-bullet">
          {line.slice(2)}
        </p>
      );
    }
    if (line.startsWith("|")) {
      return (
        <code key={index} className="md-table-row">
          {line}
        </code>
      );
    }
    if (line.startsWith("**") && line.endsWith("**")) {
      return <p key={index}><strong>{line.slice(2, -2)}</strong></p>;
    }
    if (line.startsWith("_") && line.endsWith("_")) {
      return <p key={index} className="md-muted">{line.slice(1, -1)}</p>;
    }
    if (!line.trim()) {
      return <div key={index} className="md-spacer" />;
    }
    return <p key={index}>{line}</p>;
  });
}

export function CfoAnalysis() {
  const [view, setView] = useState("charts");
  const [showMarkdown, setShowMarkdown] = useState(false);
  const [filters, setFilters] = useState({ company: "", from: "", to: "" });
  const [applied, setApplied] = useState({ company: "", from: "", to: "" });
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);

  const showApl = !applied.company || applied.company === "accessible";
  const showTrifone = !applied.company || applied.company === "trifone";
  const showElectronics = !applied.company || applied.company === "electronics";

  async function load(params = applied) {
    setLoading(true);
    setError("");
    try {
      const result = await api.analysis(params);
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, []);

  function applyFilters(e) {
    e.preventDefault();
    setApplied(filters);
    load(filters).catch((err) => setError(err.message));
  }

  async function downloadMarkdown() {
    setDownloading(true);
    setError("");
    try {
      await api.downloadAnalysisMarkdown(applied);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading(false);
    }
  }

  const movementChart = useMemo(
    () => data?.movement?.byDate || [],
    [data]
  );

  const companyMovement = useMemo(
    () => data?.movement?.byCompany || [],
    [data]
  );

  if (loading && !data) {
    return (
      <div className="page">
        <header className="page-head">
          <p className="eyebrow">Chief Financial Officer</p>
          <h1>Analysis</h1>
        </header>
        <p className="hint">Loading financial analysis…</p>
      </div>
    );
  }

  const apl = data?.accessible;
  const trf = data?.trifone;
  const elec = data?.electronics;

  return (
    <div className="page">
      <header className="page-head split">
        <div>
          <p className="eyebrow">Chief Financial Officer</p>
          <h1>Analysis</h1>
          <p className="lede tight">
            Inventory, revenue, and margin insights across APL, Trifone Gadgets, and Trifone Electronics — drawn from live catalogues and ledger movement.
          </p>
        </div>
        <div className="export-row">
          <button
            type="button"
            className="ghost"
            onClick={() => setShowMarkdown((v) => !v)}
          >
            {showMarkdown ? "Hide report" : "Show report"}
          </button>
          <button
            type="button"
            className="ghost"
            disabled={downloading}
            onClick={downloadMarkdown}
          >
            {downloading ? "Preparing…" : "Download .md"}
          </button>
        </div>
      </header>

      <div className="analysis-toolbar">
        <div className="view-toggle" role="tablist" aria-label="Analysis view">
          <button
            type="button"
            role="tab"
            aria-selected={view === "charts"}
            className={view === "charts" ? "active" : ""}
            onClick={() => setView("charts")}
          >
            Charts
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "numbers"}
            className={view === "numbers" ? "active" : ""}
            onClick={() => setView("numbers")}
          >
            Numbers
          </button>
        </div>
      </div>

      <form className="filter-bar" onSubmit={applyFilters}>
        <label>
          Company
          <select
            value={filters.company}
            onChange={(e) => setFilters((p) => ({ ...p, company: e.target.value }))}
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
        <button type="submit" disabled={loading}>
          {loading ? "Loading…" : "Apply"}
        </button>
      </form>

      {error ? <p className="alert">{error}</p> : null}

      {showMarkdown && data?.markdown ? (
        <section className="panel md-panel">
          <div className="section-head">
            <h2>Markdown report</h2>
            <small className="hint">
              Generated {new Date(data.generatedAt).toLocaleString()}
            </small>
          </div>
          <div className="md-content">{renderMarkdown(data.markdown)}</div>
        </section>
      ) : null}

      {view === "numbers" ? (
        <>
          {showApl && apl ? (
            <section className="panel">
              <div className="section-head">
                <h2>{companyLabel("accessible")}</h2>
                <span className="hint">Book inventory, demand & stock health</span>
              </div>
              <div className="kpi-grid">
                <Kpi label="Titles in catalogue" value={fmt(apl.summary.totalProducts)} />
                <Kpi label="Total stock units" value={fmt(apl.summary.totalStockUnits)} featured />
                <Kpi label="Out of stock" value={fmt(apl.summary.outOfStock)} tone="down" />
                <Kpi label="Critical (1–5)" value={fmt(apl.summary.criticalStockCount)} tone="down" />
                <Kpi label="Low (6–20)" value={fmt(apl.summary.lowStockCount)} tone="down" />
                <Kpi label="Restock alerts" value={fmt(apl.summary.restockAlertCount)} hint="Demand + low stock" />
                <Kpi label="Active titles" value={fmt(apl.summary.activeTitles)} hint="Had ledger movement" />
                <Kpi label="Total outbound" value={fmt(apl.summary.totalOutbound)} tone="down" />
                <Kpi label="Total inbound" value={fmt(apl.summary.totalInbound)} tone="up" />
                <Kpi label="Slow movers" value={fmt(apl.summary.slowMoverCount)} hint="50+ units, no sales" />
              </div>

              {apl.topPerformers?.length ? (
                <>
                  <h3 className="subhead">Best performing titles</h3>
                  <p className="hint">Ranked by outbound movement in the filtered period</p>
                  <div className="table-wrap flush">
                    <table>
                      <thead>
                        <tr>
                          <th>Title</th>
                          <th>Outbound</th>
                          <th>Inbound</th>
                          <th>Stock</th>
                          <th>Turnover</th>
                        </tr>
                      </thead>
                      <tbody>
                        {apl.topPerformers.map((row) => (
                          <tr key={row.fullName}>
                            <td>{row.fullName}</td>
                            <td className="num-strong">{fmt(row.outbound)}</td>
                            <td>{fmt(row.inbound)}</td>
                            <td>{fmt(row.totalStock)}</td>
                            <td>{row.turnoverRate}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}

              {apl.restockAlerts?.length ? (
                <>
                  <h3 className="subhead">Restock alerts</h3>
                  <p className="hint">High demand with critically low or zero stock</p>
                  <div className="table-wrap flush">
                    <table>
                      <thead>
                        <tr>
                          <th>Title</th>
                          <th>Stock left</th>
                          <th>Outbound</th>
                          <th>Turnover</th>
                          <th>Priority</th>
                        </tr>
                      </thead>
                      <tbody>
                        {apl.restockAlerts.map((row) => (
                          <tr key={row.name}>
                            <td>{row.name}</td>
                            <td className="num-strong">{fmt(row.totalStock)}</td>
                            <td>{fmt(row.outbound)}</td>
                            <td>{row.turnoverRate}%</td>
                            <td>
                              <span className={`status-pill status-pill--${row.priority}`}>
                                {row.priority}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}

              {apl.outOfStockItems?.length ? (
                <>
                  <h3 className="subhead">Out of stock titles</h3>
                  <p className="hint">
                    {fmt(apl.summary.outOfStock)} titles with zero units across all locations
                  </p>
                  <div className="table-wrap flush">
                    <table>
                      <thead>
                        <tr>
                          <th>Title</th>
                          <th>Recent demand</th>
                        </tr>
                      </thead>
                      <tbody>
                        {apl.outOfStockItems.map((row) => (
                          <tr key={row.name}>
                            <td>{row.name}</td>
                            <td>{row.outbound > 0 ? `${fmt(row.outbound)} outbound` : "None"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}

              {apl.criticalStock?.length ? (
                <>
                  <h3 className="subhead">Critical stock (1–5 units)</h3>
                  <div className="table-wrap flush">
                    <table>
                      <thead>
                        <tr>
                          <th>Title</th>
                          <th>Units</th>
                          <th>Outbound</th>
                          <th>Stocked at</th>
                          <th>Empty at</th>
                        </tr>
                      </thead>
                      <tbody>
                        {apl.criticalStock.map((row) => (
                          <tr key={row.name}>
                            <td>{row.name}</td>
                            <td className="num-strong">{fmt(row.totalStock)}</td>
                            <td>{fmt(row.outbound)}</td>
                            <td>{row.stockedAt.join(", ") || "—"}</td>
                            <td>{row.emptyAt.join(", ") || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}

              {apl.lowStock?.length ? (
                <>
                  <h3 className="subhead">Low stock (6–20 units)</h3>
                  <div className="table-wrap flush">
                    <table>
                      <thead>
                        <tr>
                          <th>Title</th>
                          <th>Units</th>
                          <th>Outbound</th>
                          <th>Stocked at</th>
                        </tr>
                      </thead>
                      <tbody>
                        {apl.lowStock.map((row) => (
                          <tr key={row.name}>
                            <td>{row.name}</td>
                            <td>{fmt(row.totalStock)}</td>
                            <td>{fmt(row.outbound)}</td>
                            <td>{row.stockedAt.join(", ") || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}

              {apl.slowMovers?.length ? (
                <>
                  <h3 className="subhead">Slow movers</h3>
                  <p className="hint">High inventory with no outbound in the period</p>
                  <div className="table-wrap flush">
                    <table>
                      <thead>
                        <tr>
                          <th>Title</th>
                          <th>Units</th>
                          <th>Locations</th>
                        </tr>
                      </thead>
                      <tbody>
                        {apl.slowMovers.map((row) => (
                          <tr key={row.name}>
                            <td>{row.name}</td>
                            <td>{fmt(row.totalStock)}</td>
                            <td>{row.locationCount}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}

              {apl.byLocation.length ? (
                <>
                  <h3 className="subhead">Stock by location</h3>
                  <div className="table-wrap flush">
                    <table>
                      <thead>
                        <tr>
                          <th>Location</th>
                          <th>Units</th>
                          <th>Share</th>
                        </tr>
                      </thead>
                      <tbody>
                        {apl.byLocation.map((row) => (
                          <tr key={row.location}>
                            <td>{row.location}</td>
                            <td>{fmt(row.units)}</td>
                            <td>{row.share}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </section>
          ) : null}

          {showTrifone && trf ? (
            <section className="panel">
              <div className="section-head">
                <h2>{companyLabel("trifone")}</h2>
                <span className="hint">August register — revenue & margin</span>
              </div>
              <div className="kpi-grid">
                <Kpi label="SKUs in catalogue" value={fmt(trf.summary.totalProducts)} />
                <Kpi label="Sales revenue" value={fmtMoney(trf.summary.totalSalesRevenue)} featured />
                <Kpi label="Stock value on hand" value={fmtMoney(trf.summary.totalStockValue)} />
                <Kpi
                  label="Gross profit"
                  value={fmtMoney(trf.summary.totalGrossProfit)}
                  hint={`${trf.summary.portfolioGrossMarginPct}% portfolio margin`}
                  tone="up"
                />
                <Kpi label="Maintenance exposure" value={fmtMoney(trf.summary.totalMaintenanceValue)} />
                <Kpi label="Return value" value={fmtMoney(trf.summary.totalReturnValue)} tone="down" />
                <Kpi label="Units sold" value={fmt(trf.summary.totalUnitsSold)} />
                <Kpi label="Cost of goods sold" value={fmtMoney(trf.summary.totalCostOfGoods)} />
                <Kpi label="Current stock" value={fmt(trf.summary.totalCurrentStock)} />
                <Kpi label="Out of stock SKUs" value={fmt(trf.summary.outOfStock)} tone="down" />
              </div>
              {trf.topByRevenue.length ? (
                <>
                  <h3 className="subhead">Top revenue SKUs</h3>
                  <div className="table-wrap flush">
                    <table>
                      <thead>
                        <tr>
                          <th>SKU</th>
                          <th>Revenue</th>
                          <th>Units sold</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trf.topByRevenue.map((row) => (
                          <tr key={row.fullName}>
                            <td>{row.fullName}</td>
                            <td>{fmtMoney(row.salesRevenue)}</td>
                            <td>{fmt(row.unitsSold)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
              {trf.marginLeaders.length ? (
                <>
                  <h3 className="subhead">Margin leaders</h3>
                  <div className="table-wrap flush">
                    <table>
                      <thead>
                        <tr>
                          <th>SKU</th>
                          <th>Margin</th>
                          <th>Gross profit</th>
                          <th>Revenue</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trf.marginLeaders.map((row) => (
                          <tr key={row.name}>
                            <td>{row.name}</td>
                            <td>{row.grossMarginPct}%</td>
                            <td>{fmtMoney(row.grossProfit)}</td>
                            <td>{fmtMoney(row.salesRevenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </section>
          ) : null}

          {showElectronics && elec ? (
            <section className="panel">
              <div className="section-head">
                <h2>{companyLabel("electronics")}</h2>
                <span className="hint">July closing balance — live stock</span>
              </div>
              <div className="kpi-grid">
                <Kpi label="SKUs in catalogue" value={fmt(elec.summary.totalProducts)} />
                <Kpi
                  label="Current stock"
                  value={fmt(elec.summary.totalCurrentStock)}
                  featured
                />
                <Kpi label="Out of stock SKUs" value={fmt(elec.summary.outOfStock)} tone="down" />
                <Kpi label="Critical stock" value={fmt(elec.summary.criticalStockCount)} />
                <Kpi label="Low stock" value={fmt(elec.summary.lowStockCount)} />
              </div>
              {elec.topProducts?.length ? (
                <>
                  <h3 className="subhead">Top SKUs by current stock</h3>
                  <div className="table-wrap flush">
                    <table>
                      <thead>
                        <tr>
                          <th>Item</th>
                          <th>Current stock</th>
                        </tr>
                      </thead>
                      <tbody>
                        {elec.topProducts.map((row) => (
                          <tr key={row.fullName}>
                            <td>{row.fullName}</td>
                            <td className="num-strong">{fmt(row.currentStock)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </section>
          ) : null}

          {data?.movement?.totals ? (
            <section className="panel">
              <div className="section-head">
                <h2>Ledger movement</h2>
                <span className="hint">Filtered posting period</span>
              </div>
              <div className="kpi-grid">
                <Kpi label="Records" value={fmt(data.movement.totals.recordCount)} />
                <Kpi label="Inbound" value={fmt(data.movement.totals.inbound)} tone="up" />
                <Kpi label="Outbound" value={fmt(data.movement.totals.outbound)} tone="down" />
                <Kpi label="Net movement" value={fmt(data.movement.totals.netMovement)} featured />
              </div>
            </section>
          ) : null}
        </>
      ) : (
        <section className="chart-grid">
          {showApl && apl?.stockHealth?.length ? (
            <article className="panel">
              <h2>APL stock health</h2>
              <p className="hint">Out of stock, critical, low, watch & healthy titles</p>
              <div className="chart">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={apl.stockHealth}
                      dataKey="count"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      outerRadius={96}
                      label={({ label, count }) => `${label}: ${count}`}
                    >
                      {apl.stockHealth.map((entry) => (
                        <Cell key={entry.status} fill={HEALTH_COLORS[entry.status] || "#57534e"} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => fmt(value)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </article>
          ) : null}

          {showApl && apl?.performerChart?.length ? (
            <article className="panel">
              <h2>APL best performers</h2>
              <p className="hint">Top titles by outbound movement</p>
              <div className="chart">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={apl.performerChart} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid stroke="#e7e0d4" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value) => fmt(value)} />
                    <Legend />
                    <Bar dataKey="outbound" name="Outbound" fill="#9a3412" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="inbound" name="Inbound" fill="#1f6b4a" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>
          ) : null}

          {showApl && apl?.topByTurnover?.length ? (
            <article className="panel">
              <h2>APL turnover rate</h2>
              <p className="hint">Outbound as % of current stock — fastest-moving titles</p>
              <div className="chart">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={apl.topByTurnover}>
                    <CartesianGrid stroke="#e7e0d4" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      interval={0}
                      angle={-14}
                      textAnchor="end"
                      height={70}
                    />
                    <YAxis tick={{ fontSize: 12 }} unit="%" />
                    <Tooltip formatter={(value, name) => (name === "Turnover %" ? `${value}%` : fmt(value))} />
                    <Bar dataKey="turnoverRate" name="Turnover %" fill="#b08a2d" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>
          ) : null}

          {showApl && apl?.byLocation?.length ? (
            <article className="panel">
              <h2>APL stock by location</h2>
              <p className="hint">Distribution of book units across hubs</p>
              <div className="chart">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={apl.byLocation}>
                    <CartesianGrid stroke="#e7e0d4" vertical={false} />
                    <XAxis dataKey="location" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value) => fmt(value)} />
                    <Bar dataKey="units" name="Units" fill="#132337" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>
          ) : null}

          {showApl && apl?.topProducts?.length ? (
            <article className="panel">
              <h2>APL top titles by stock</h2>
              <p className="hint">Highest volume book titles</p>
              <div className="chart">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={apl.topProducts} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid stroke="#e7e0d4" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={120}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip formatter={(value) => fmt(value)} />
                    <Bar dataKey="totalStock" name="Units" fill="#1f6b4a" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>
          ) : null}

          {showApl && apl?.byLocation?.length ? (
            <article className="panel">
              <h2>APL location share</h2>
              <p className="hint">Percentage of total APL inventory</p>
              <div className="chart">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={apl.byLocation}
                      dataKey="units"
                      nameKey="location"
                      cx="50%"
                      cy="50%"
                      outerRadius={96}
                      label={({ location, share }) => `${location} ${share}%`}
                    >
                      {apl.byLocation.map((entry, index) => (
                        <Cell key={entry.location} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => fmt(value)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </article>
          ) : null}

          {showTrifone && trf?.financialOverview?.length ? (
            <article className="panel">
              <h2>Trifone Gadgets financial overview</h2>
              <p className="hint">Revenue, inventory value, maintenance & returns</p>
              <div className="chart">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={trf.financialOverview}>
                    <CartesianGrid stroke="#e7e0d4" vertical={false} />
                    <XAxis
                      dataKey="metric"
                      tick={{ fontSize: 11 }}
                      interval={0}
                      angle={-12}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => fmtMoney(v)} />
                    <Tooltip formatter={(value) => fmtMoney(value)} />
                    <Bar dataKey="value" name="Amount (₦)" fill="#b08a2d" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>
          ) : null}

          {showTrifone && trf?.topByUnitsSold?.length ? (
            <article className="panel">
              <h2>Trifone Gadgets units sold</h2>
              <p className="hint">Top SKUs by volume — with cost of goods</p>
              <div className="chart">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={trf.topByUnitsSold} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid stroke="#e7e0d4" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={110}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip formatter={(value, name) => (name === "Cost of goods" ? fmtMoney(value) : fmt(value))} />
                    <Legend />
                    <Bar dataKey="unitsSold" name="Units sold" fill="#132337" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>
          ) : null}

          {showTrifone && trf?.topByMaintenance?.length ? (
            <article className="panel">
              <h2>Trifone Gadgets maintenance exposure</h2>
              <p className="hint">Maintenance value by SKU</p>
              <div className="chart">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={trf.topByMaintenance}>
                    <CartesianGrid stroke="#e7e0d4" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      interval={0}
                      angle={-14}
                      textAnchor="end"
                      height={70}
                    />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => fmtMoney(v)} />
                    <Tooltip formatter={(value) => fmtMoney(value)} />
                    <Bar dataKey="maintenanceValue" name="Maintenance (₦)" fill="#9a3412" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>
          ) : null}

          {showTrifone && trf?.topByRevenue?.some((row) => row.salesRevenue > 0) ? (
            <article className="panel">
              <h2>Trifone Gadgets top revenue SKUs</h2>
              <p className="hint">August register sales revenue</p>
              <div className="chart">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={trf.topByRevenue} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid stroke="#e7e0d4" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v) => fmtMoney(v)} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={110}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip formatter={(value) => fmtMoney(value)} />
                    <Bar dataKey="salesRevenue" name="Revenue" fill="#132337" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>
          ) : null}

          {showTrifone && trf?.marginLeaders?.length ? (
            <article className="panel">
              <h2>Trifone Gadgets gross margin %</h2>
              <p className="hint">Best margin performers by SKU</p>
              <div className="chart">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart
                    data={trf.marginLeaders.map((row) => ({
                      ...row,
                      label: truncateLabel(row.name, 16),
                    }))}
                  >
                    <CartesianGrid stroke="#e7e0d4" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-14} textAnchor="end" height={70} />
                    <YAxis tick={{ fontSize: 12 }} unit="%" />
                    <Tooltip formatter={(value) => `${value}%`} />
                    <Bar dataKey="grossMarginPct" name="Margin %" fill="#1f6b4a" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>
          ) : null}

          {showElectronics && elec?.topProducts?.length ? (
            <article className="panel">
              <h2>Trifone Electronics stock</h2>
              <p className="hint">Highest current stock from July closing + live movement</p>
              <div className="chart">
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={elec.topProducts} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid stroke="#e7e0d4" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={140}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip formatter={(value) => fmt(value)} />
                    <Bar dataKey="currentStock" name="Units" fill="#1f6b4a" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>
          ) : null}

          {companyMovement.length ? (
            <article className="panel">
              <h2>Movement by company</h2>
              <p className="hint">Inbound vs outbound from ledger</p>
              <div className="chart">
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={companyMovement}>
                    <CartesianGrid stroke="#e7e0d4" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value) => fmt(value)} />
                    <Legend />
                    <Bar dataKey="inbound" name="Inbound" fill="#1f6b4a" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="outbound" name="Outbound" fill="#9a3412" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>
          ) : null}

          {movementChart.length ? (
            <article className="panel">
              <h2>Daily ledger movement</h2>
              <p className="hint">Inbound and outbound over the filtered period</p>
              <div className="chart">
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={movementChart}>
                    <CartesianGrid stroke="#e7e0d4" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value) => fmt(value)} />
                    <Legend />
                    <Line type="monotone" dataKey="inbound" name="Inbound" stroke="#1f6b4a" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="outbound" name="Outbound" stroke="#9a3412" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </article>
          ) : null}

          {!apl?.summary?.totalProducts && !trf?.summary?.totalProducts ? (
            <article className="panel">
              <h2>No catalogue data yet</h2>
              <p className="hint">
                Upload product catalogues on the Product catalog page to populate analysis charts and numbers.
              </p>
            </article>
          ) : null}
        </section>
      )}
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
