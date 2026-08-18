import { useEffect, useState } from "react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext.jsx";
import { companyLabel } from "../constants/companies";
import { staffAssignmentLabel } from "../utils/staff.js";

const PAGE_SIZE = 50;

function fmt(value) {
  return Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: 0,
  });
}

export function StaffStockList() {
  const { user } = useAuth();
  const assignmentLabel = staffAssignmentLabel(user);
  const isTrifoneStaff = user?.assignedCompany === "trifone";

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
          <p className="eyebrow">Data clerk · {assignmentLabel}</p>
          <h1>Inventory</h1>
        </div>
        <p className="lede tight">
          Live stock balances for {isTrifoneStaff ? "Trifone" : companyLabel("accessible")}
          {!isTrifoneStaff ? ` at location ${assignmentLabel}` : ""}. To change a
          balance, go to <strong>Stock movement</strong> and post an In or Out
          transaction.
        </p>
      </header>

      <section className="table-wrap">
        <div className="section-head">
          <h2>{isTrifoneStaff ? "All items" : "All books"}</h2>
          <span>{total.toLocaleString()} products</span>
        </div>

        <form className="list-toolbar" onSubmit={onSearch}>
          <input
            type="search"
            placeholder={isTrifoneStaff ? "Search items…" : "Search book names…"}
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
                    <th>{isTrifoneStaff ? "Item Name" : "BookName"}</th>
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
