import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { api } from "../api";
import { useDialog } from "../context/DialogContext.jsx";

const PAGE_SIZE = 50;

const COMPANIES = [
  {
    id: "accessible",
    label: "Accessible Publishers Limited",
    ready: true,
  },
  {
    id: "trifone",
    label: "Trifone",
    ready: true,
  },
];

const TRIFONE_FIELD_LABELS = {
  openingStock2Aug: "Opening (2/8)",
  openingStock9Aug: "Opening (9/8)",
  openingStock16Aug: "Opening (16/8)",
  restock2Aug: "Restock (2/8)",
  currentStock: "Current Stock",
  unitsInMaint: "Units in Maint.",
  unitsInMaint3Aug: "Maint. (3/8)",
  totalMaint: "Total Maint.",
  returns: "Returns",
  maintenanceValue: "Maint. Value",
  returnValue: "Return Value",
  unitsSold: "Units Sold",
  costPrice: "Cost Price",
  unitPrice: "Unit Price",
  salesRevenue: "Sales Revenue",
  stockValueOnHand: "Stock Value",
  remarks: "Remarks",
};

function formatCellValue(value, type) {
  if (type === "text") return value || "—";
  if (type === "money") return Number(value || 0).toLocaleString();
  return Number(value || 0).toLocaleString();
}

function trifoneFieldLabel(field) {
  return TRIFONE_FIELD_LABELS[field.key] || field.label;
}

export function CfoProducts() {
  const { confirm, toast } = useDialog();
  const [company, setCompany] = useState("accessible");
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [trifoneFields, setTrifoneFields] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [deletingColumn, setDeletingColumn] = useState(null);
  const fileRef = useRef(null);

  const activeCompany = COMPANIES.find((item) => item.id === company) || COMPANIES[0];
  const isTrifone = company === "trifone";

  async function loadList(nextPage = page, nextSearch = appliedSearch) {
    if (!activeCompany.ready) {
      setProducts([]);
      setLocations([]);
      setTrifoneFields([]);
      setTotal(0);
      setPage(1);
      setTotalPages(1);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const data = await api.products({
        company,
        page: nextPage,
        limit: PAGE_SIZE,
        search: nextSearch,
        live: true,
      });
      setProducts(data.products);
      setLocations(data.locations || []);
      setTrifoneFields(data.trifoneFields || []);
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
    setPage(1);
    setAppliedSearch("");
    setSearch("");
    loadList(1, "").catch((err) => setError(err.message));
  }, [company]);

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

  async function onUpload(e) {
    e.preventDefault();
    if (!activeCompany.ready) {
      setError("Upload for this company is not available yet.");
      return;
    }

    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose an Excel file first.");
      return;
    }

    if (
      !(await confirm({
        title: "Replace catalog",
        message: `This will replace all products for ${activeCompany.label} with the uploaded file. Continue?`,
        confirmLabel: "Replace catalog",
        variant: "danger",
      }))
    ) {
      return;
    }

    setBusy(true);
    setError("");
    try {
      const result = await api.uploadProducts(file, company);
      toast({ message: result.message, type: "success" });
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
    if (!activeCompany.ready) {
      setError("Template for this company is not available yet.");
      return;
    }

    setDownloading(true);
    setError("");
    try {
      await api.downloadProductTemplate(company);
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading(false);
    }
  }

  async function deleteRow(product) {
    if (
      !(await confirm({
        title: "Delete product",
        message: `Remove "${product.name}" from the ${activeCompany.label} catalog? This cannot be undone.`,
        confirmLabel: "Delete row",
        variant: "danger",
      }))
    ) {
      return;
    }

    setDeletingId(product._id);
    setError("");
    try {
      const result = await api.deleteProduct(product._id);
      toast({ message: result.message, type: "success" });
      const nextPage =
        products.length === 1 && page > 1 ? page - 1 : page;
      await loadList(nextPage, appliedSearch);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId(null);
    }
  }

  async function deleteColumn(columnKey, columnLabel) {
    if (
      !(await confirm({
        title: "Delete column",
        message: `Remove the "${columnLabel}" column from all products in the ${activeCompany.label} catalog? This cannot be undone.`,
        confirmLabel: "Delete column",
        variant: "danger",
      }))
    ) {
      return;
    }

    setDeletingColumn(columnKey);
    setError("");
    try {
      const result = await api.deleteProductColumn(company, columnKey);
      toast({ message: result.message, type: "success" });
      await loadList(page, appliedSearch);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingColumn(null);
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
          Upload inventory by company. Trifone reads August columns only from the
          stock register; earlier months are ignored. Stock counts reflect live
          balances updated by staff. Use the delete icons to remove unwanted rows
          or columns from the catalog.
        </p>
      </header>

      <div className="company-tabs" role="tablist" aria-label="Company catalog">
        {COMPANIES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={company === item.id}
            className={company === item.id ? "company-tab active" : "company-tab"}
            onClick={() => setCompany(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <section className="entry-card upload-card">
        <div className="section-head">
          <h2>Upload products</h2>
          <button
            type="button"
            className="ghost"
            disabled={downloading || !activeCompany.ready}
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
          {isTrifone ? (
            <p className="hint">
              Upload the full <strong>Stock &amp; Maintenance Operations Register</strong>.
              We read <strong>ITEM NAME</strong> plus August fields only (opening stock,
              restock, current stock, maintenance, sales, and remarks). April–July
              columns are ignored.
            </p>
          ) : (
            <p className="hint">
              Required columns: <strong>BookName</strong>, then location counts for{" "}
              {locations.length ? locations.join(", ") : "HO, AK, AB, ED, LA, KA, US, AN, ANX"}.
              Sale Price, AllTotal, and Total are ignored if present.
            </p>
          )}

          <div className="actions">
            <button type="submit" disabled={busy}>
              {busy ? "Uploading…" : `Upload ${activeCompany.label} catalog`}
            </button>
          </div>
        </form>
      </section>

      <section className="table-wrap">
        <div className="section-head">
          <h2>{activeCompany.label} inventory</h2>
          <span>{total.toLocaleString()} products</span>
        </div>

        <form className="list-toolbar" onSubmit={onSearch}>
          <input
            type="search"
            placeholder={isTrifone ? "Search item names…" : "Search book names…"}
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
            <div className="table-scroll wide-table">
              <table className="inventory-table catalog-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{isTrifone ? "Item Name" : "BookName"}</th>
                    {isTrifone
                      ? trifoneFields.map((field) => (
                          <th key={field.key}>
                            <span className="col-head">
                              <span>{trifoneFieldLabel(field)}</span>
                              <button
                                type="button"
                                className="icon-btn danger"
                                title={`Delete ${trifoneFieldLabel(field)} column`}
                                aria-label={`Delete ${trifoneFieldLabel(field)} column`}
                                disabled={deletingColumn === field.key}
                                onClick={() =>
                                  deleteColumn(field.key, trifoneFieldLabel(field))
                                }
                              >
                                <Trash2 size={14} />
                              </button>
                            </span>
                          </th>
                        ))
                      : locations.map((loc) => (
                          <th key={loc}>
                            <span className="col-head">
                              <span>{loc}</span>
                              <button
                                type="button"
                                className="icon-btn danger"
                                title={`Delete ${loc} column`}
                                aria-label={`Delete ${loc} column`}
                                disabled={deletingColumn === loc}
                                onClick={() => deleteColumn(loc, loc)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </span>
                          </th>
                        ))}
                    {!isTrifone ? <th>AllTotal</th> : null}
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {products.map((product, index) => (
                    <tr key={product._id || product.name}>
                      <td>{start + index}</td>
                      <td>{product.name}</td>
                      {isTrifone
                        ? trifoneFields.map((field) => (
                            <td
                              key={field.key}
                              className={
                                field.type === "money" ? "num-strong" : undefined
                              }
                            >
                              {formatCellValue(
                                product.trifoneData?.[field.key],
                                field.type
                              )}
                            </td>
                          ))
                        : locations.map((loc) => (
                            <td key={loc}>
                              {Number(product.stock?.[loc] || 0).toLocaleString()}
                            </td>
                          ))}
                      {!isTrifone ? (
                        <td className="num-strong">
                          {Number(product.allTotal || 0).toLocaleString()}
                        </td>
                      ) : null}
                      <td className="row-actions">
                        <button
                          type="button"
                          className="icon-btn danger"
                          title={`Delete ${product.name}`}
                          aria-label={`Delete ${product.name}`}
                          disabled={deletingId === product._id}
                          onClick={() => deleteRow(product)}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
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
              : `No products yet for ${activeCompany.label}. Upload an Excel file to populate the catalog.`}
          </p>
        )}
      </section>
    </div>
  );
}
