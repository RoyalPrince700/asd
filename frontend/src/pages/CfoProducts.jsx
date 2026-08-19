import { useEffect, useRef, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
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
    label: "Trifone Gadgets",
    ready: true,
  },
  {
    id: "electronics",
    label: "Trifone Electronics",
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

function catalogCacheKey(companyId, searchValue = "") {
  return `${companyId}::${searchValue}`;
}

export function CfoProducts() {
  const { confirm, toast } = useDialog();
  const [company, setCompany] = useState("accessible");
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [trifoneFields, setTrifoneFields] = useState([]);
  const [electronicsFields, setElectronicsFields] = useState([]);
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
  const [uploadMode, setUploadMode] = useState("update");
  const [dataCompany, setDataCompany] = useState(null);
  const fileRef = useRef(null);
  const loadSeqRef = useRef(0);
  const catalogCacheRef = useRef(new Map());

  const activeCompany = COMPANIES.find((item) => item.id === company) || COMPANIES[0];
  const isTrifone = company === "trifone";
  const isElectronics = company === "electronics";
  const isItemCatalog = isTrifone || isElectronics;
  const catalogMatches = dataCompany === company;

  function applyCatalog(snapshot, { asLoading = false } = {}) {
    setProducts(snapshot.products);
    setLocations(snapshot.locations);
    setTrifoneFields(snapshot.trifoneFields);
    setElectronicsFields(snapshot.electronicsFields);
    setTotal(snapshot.total);
    setPage(snapshot.page);
    setTotalPages(snapshot.totalPages);
    setDataCompany(snapshot.company);
    setLoading(asLoading);
  }

  function showSwitchingState() {
    setProducts([]);
    setLocations([]);
    setTrifoneFields([]);
    setElectronicsFields([]);
    setTotal(0);
    setPage(1);
    setTotalPages(1);
    setDataCompany(null);
    setError("");
    setLoading(true);
  }

  function selectCompany(nextCompany) {
    if (nextCompany === company) return;
    loadSeqRef.current += 1;
    setCompany(nextCompany);
    setSearch("");
    setAppliedSearch("");
    setError("");
    setUploadMode("update");
    if (fileRef.current) fileRef.current.value = "";

    const cached = catalogCacheRef.current.get(catalogCacheKey(nextCompany, ""));
    if (cached) {
      applyCatalog(cached, { asLoading: true });
    } else {
      showSwitchingState();
    }
  }

  async function loadList(
    nextCompany = company,
    nextPage = page,
    nextSearch = appliedSearch
  ) {
    const seq = ++loadSeqRef.current;

    if (!COMPANIES.find((item) => item.id === nextCompany)?.ready) {
      if (seq !== loadSeqRef.current) return;
      showSwitchingState();
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const data = await api.products({
        company: nextCompany,
        page: nextPage,
        limit: PAGE_SIZE,
        search: nextSearch,
        live: true,
      });
      if (seq !== loadSeqRef.current) return;
      const snapshot = {
        company: nextCompany,
        products: data.products,
        locations: data.locations || [],
        trifoneFields: data.trifoneFields || [],
        electronicsFields: data.electronicsFields || [],
        total: data.total,
        page: data.page,
        totalPages: data.totalPages,
      };
      catalogCacheRef.current.set(catalogCacheKey(nextCompany, nextSearch), snapshot);
      applyCatalog(snapshot);
    } catch (err) {
      if (seq !== loadSeqRef.current) return;
      setError(err.message);
    } finally {
      if (seq === loadSeqRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    loadList(company, 1, appliedSearch).catch((err) => setError(err.message));
  }, [company, appliedSearch]);

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

    const isReplace = uploadMode === "replace";
    if (
      !(await confirm({
        title: isReplace ? "Replace catalog" : "Update catalog",
        message: isReplace
          ? `This will delete all ${total.toLocaleString()} existing products for ${activeCompany.label} and replace them with the uploaded file only. Continue?`
          : `This will update stock figures for matching products and add any new ones from the file. Products not in the file (currently ${total.toLocaleString()} in catalog) will be kept unchanged. Continue?`,
        confirmLabel: isReplace ? "Replace catalog" : "Update catalog",
        variant: isReplace ? "danger" : "default",
      }))
    ) {
      return;
    }

    setBusy(true);
    setError("");
    try {
      const result = await api.uploadProducts(file, company, uploadMode);
      toast({ message: result.message, type: "success" });
      if (fileRef.current) fileRef.current.value = "";
      setPage(1);
      setAppliedSearch("");
      setSearch("");
      await loadList(company, 1, "");
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
      await loadList(company, nextPage, appliedSearch);
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
      await loadList(company, page, appliedSearch);
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingColumn(null);
    }
  }

  const start = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, total);
  const electronicsColumns = electronicsFields.length
    ? electronicsFields
    : [{ key: "currentStock", label: "Current Stock", type: "count" }];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Chief Financial Officer</p>
          <h1>Product catalog</h1>
        </div>
        <p className="lede tight">
          Upload inventory by company. Use <strong>Update catalog</strong> to refresh
          figures from a new month&apos;s Excel while keeping products not in the file.
          Trifone Gadgets reads August columns only. Trifone Electronics reads product
          names from the top row and the <strong>July closing balance</strong> row only.
          Stock counts reflect live balances updated by staff.
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
            onClick={() => selectCompany(item.id)}
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
              key={company}
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
          ) : isElectronics ? (
            <p className="hint">
              Upload the <strong>Inventory Movement</strong> workbook. Product names
              sit across the top (Juice Extractor, Digital 10L Air Fryer, and so on).
              Earlier movement rows are ignored — only the last{" "}
              <strong>CLOSING BALANCE AS AT JULY</strong> row is imported as current stock.
            </p>
          ) : (
            <p className="hint">
              Required columns: <strong>BookName</strong>, then location counts for{" "}
              {locations.length ? locations.join(", ") : "HO, AK, AB, ED, LA, KA, US, AN, ANX"}.
              Sale Price, AllTotal, and Total are ignored if present.
            </p>
          )}

          <fieldset className="upload-mode">
            <legend>Upload mode</legend>
            <label className="radio-option">
              <input
                type="radio"
                name="uploadMode"
                value="update"
                checked={uploadMode === "update"}
                onChange={() => setUploadMode("update")}
              />
              <span>
                <strong>Update catalog</strong> — refresh figures for products in the
                file; add new products; keep existing products not in the file
              </span>
            </label>
            <label className="radio-option">
              <input
                type="radio"
                name="uploadMode"
                value="replace"
                checked={uploadMode === "replace"}
                onChange={() => setUploadMode("replace")}
              />
              <span>
                <strong>Replace catalog</strong> — delete all current products and
                import only what is in the file
              </span>
            </label>
          </fieldset>

          <div className="actions">
            <button type="submit" disabled={busy}>
              {busy
                ? "Uploading…"
                : uploadMode === "replace"
                  ? `Replace ${activeCompany.label} catalog`
                  : `Update ${activeCompany.label} catalog`}
            </button>
          </div>
        </form>
      </section>

      <section className="table-wrap" key={company}>
        <div className="section-head">
          <h2>{activeCompany.label} inventory</h2>
          <span>
            {catalogMatches
              ? `${total.toLocaleString()} products`
              : "Loading…"}
            {catalogMatches && loading ? " · updating" : ""}
          </span>
        </div>

        <form className="list-toolbar" onSubmit={onSearch}>
          <input
            type="search"
            placeholder={isItemCatalog ? "Search item names…" : "Search book names…"}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            disabled={!catalogMatches}
          />
          <button type="submit" disabled={!catalogMatches}>Search</button>
          {appliedSearch ? (
            <button type="button" className="ghost" onClick={clearSearch}>
              Clear
            </button>
          ) : null}
        </form>

        {error ? <p className="alert">{error}</p> : null}

        {!catalogMatches ? (
          <div className="catalog-loading" role="status" aria-live="polite">
            {error ? (
              <>
                <strong>Could not load {activeCompany.label}</strong>
                <p>
                  The previous company was not kept on screen. Try again when the
                  network is ready.
                </p>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => loadList(company, 1, appliedSearch)}
                >
                  Try again
                </button>
              </>
            ) : (
              <>
                <Loader2 className="catalog-spinner" size={28} aria-hidden="true" />
                <strong>Loading {activeCompany.label}</strong>
                <p>
                  Waiting for this company&apos;s catalog. The company you just left
                  stays hidden while the network is slow.
                </p>
              </>
            )}
          </div>
        ) : products.length ? (
          <>
            <div className="table-scroll wide-table">
              <table className="inventory-table catalog-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{isItemCatalog ? "Item Name" : "BookName"}</th>
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
                      : isElectronics
                        ? electronicsColumns.map((field) => (
                            <th key={field.key}>{field.label}</th>
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
                    {!isItemCatalog ? <th>AllTotal</th> : null}
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
                        : isElectronics
                          ? electronicsColumns.map((field) => (
                              <td key={field.key} className="num-strong">
                                {formatCellValue(
                                  product.electronicsData?.[field.key] ??
                                    product.currentStock,
                                  field.type
                                )}
                              </td>
                            ))
                        : locations.map((loc) => (
                            <td key={loc}>
                              {Number(product.stock?.[loc] || 0).toLocaleString()}
                            </td>
                          ))}
                      {!isItemCatalog ? (
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
                  onClick={() => loadList(company, page - 1, appliedSearch)}
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
                  onClick={() => loadList(company, page + 1, appliedSearch)}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        ) : loading ? (
          <div className="catalog-loading" role="status" aria-live="polite">
            <Loader2 className="catalog-spinner" size={28} aria-hidden="true" />
            <strong>Loading {activeCompany.label}</strong>
            <p>Fetching this company&apos;s products…</p>
          </div>
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
