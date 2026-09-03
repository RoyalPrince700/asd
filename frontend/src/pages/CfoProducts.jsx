import { useEffect, useRef, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../context/AuthContext.jsx";
import { useDialog } from "../context/DialogContext.jsx";
import { roleLabel } from "../utils/role.js";

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
  {
    id: "press",
    label: "Press (Raw Materials)",
    ready: true,
  },
];

function formatCellValue(value) {
  return Number(value || 0).toLocaleString();
}

function formatSalePrice(value) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function catalogCacheKey(companyId, searchValue = "") {
  return `${companyId}::${searchValue}`;
}

const LOW_STOCK_THRESHOLD = 10;

function isLowStock(value) {
  return Number(value || 0) < LOW_STOCK_THRESHOLD;
}

export function CfoProducts() {
  const { user } = useAuth();
  const { confirm, toast } = useDialog();
  const canManageCatalog = user?.role === "cfo";
  const [company, setCompany] = useState("accessible");
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);
  const [trifoneFields, setTrifoneFields] = useState([]);
  const [electronicsFields, setElectronicsFields] = useState([]);
  const [pressFields, setPressFields] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
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
  const isPress = company === "press";
  const isItemCatalog = isTrifone || isElectronics || isPress;
  const catalogMatches = dataCompany === company;

  function applyCatalog(snapshot, { asLoading = false } = {}) {
    setProducts(snapshot.products);
    setLocations(snapshot.locations);
    setTrifoneFields(snapshot.trifoneFields);
    setElectronicsFields(snapshot.electronicsFields);
    setPressFields(snapshot.pressFields);
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
    setPressFields([]);
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
        pressFields: data.pressFields || [],
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
          : company === "accessible"
            ? `This will add new products from the file and update matching ones (including Sale Price; stock resets to zero). Products not in the file (currently ${total.toLocaleString()} in catalog) will be kept unchanged. Continue?`
            : company === "trifone"
              ? `This will add new products from the file and update matching ones (including Cost Price; stock resets to zero). Products not in the file (currently ${total.toLocaleString()} in catalog) will be kept unchanged. Continue?`
              : `This will add new products from the file and reset matching products to zero stock. Products not in the file (currently ${total.toLocaleString()} in catalog) will be kept unchanged. Continue?`,
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

  async function resetCompanyStock() {
    if (!activeCompany.ready) return;

    if (
      !(await confirm({
        title: `Reset ${activeCompany.label}`,
        message: `This will set all opening/closing stock to zero and delete every in/out transaction for ${activeCompany.label}. Product names stay in the catalog. This cannot be undone.`,
        confirmLabel: "Reset to zero",
        variant: "danger",
      }))
    ) {
      return;
    }

    setResetting(true);
    setError("");
    try {
      const result = await api.resetCompanyStock(company);
      catalogCacheRef.current.clear();
      toast({ message: result.message, type: "success" });
      await loadList(company, 1, appliedSearch);
    } catch (err) {
      setError(err.message);
    } finally {
      setResetting(false);
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
  const trifoneColumns = trifoneFields.length
    ? trifoneFields
    : [
        { key: "costPrice", label: "Cost Price", type: "money" },
        { key: "openingStock", label: "Opening Stock", type: "count" },
        { key: "closingStock", label: "Closing Stock", type: "count" },
      ];
  const electronicsColumns = electronicsFields.length
    ? electronicsFields
    : [
        { key: "openingStock", label: "Opening Stock", type: "count" },
        { key: "closingStock", label: "Closing Stock", type: "count" },
      ];
  const pressColumns = pressFields.length
    ? pressFields
    : [
        { key: "openingStock", label: "Opening Stock", type: "count" },
        { key: "closingStock", label: "Closing Stock", type: "count" },
      ];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">{roleLabel(user?.role)}</p>
          <h1>Product catalog</h1>
        </div>
        <p className="lede tight">
          {canManageCatalog ? (
            <>
              Upload product names by company. Accessible reads{" "}
              <strong>Sale Price</strong>; Trifone Gadgets reads{" "}
              <strong>Cost Price</strong>. Opening and closing stock start at zero —
              clerks update balances from their dashboards; detailed tracking stays in
              the ledger.
            </>
          ) : (
            <>
              Live catalog and stock by company across APL, Trifone Gadgets, Trifone
              Electronics, and Press. Catalog uploads and edits are managed by the CFO.
            </>
          )}
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

      {canManageCatalog ? (
      <section className="entry-card upload-card">
        <div className="section-head">
          <h2>Upload products</h2>
          <div className="actions" style={{ margin: 0 }}>
            <button
              type="button"
              className="ghost"
              disabled={downloading || !activeCompany.ready}
              onClick={downloadTemplate}
            >
              {downloading ? "Preparing…" : "Download template"}
            </button>
            <button
              type="button"
              className="ghost"
              disabled={resetting || busy || !activeCompany.ready || total === 0}
              onClick={resetCompanyStock}
            >
              {resetting ? "Resetting…" : "Reset in/out to 0"}
            </button>
          </div>
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
          <p className="hint">
            {isTrifone ? (
              <>
                The <strong>ITEM NAME</strong> column and the{" "}
                <strong>Cost Price</strong> column are read.{" "}
                <strong>Opening stock</strong>, <strong>closing stock</strong>, and
                other columns are ignored.
              </>
            ) : isElectronics ? (
              <>
                Only product names are read — from an <strong>Item Name</strong> column
                or names across the top row. Opening stock, closing stock, and other
                columns are ignored.
              </>
            ) : isPress ? (
              <>
                The <strong>MATERIALS ITEM</strong> column is required. Quantities are
                read from <strong>QTY USED</strong>, or from{" "}
                <strong>Opening Stock</strong> / <strong>Closing Stock</strong> when
                present. Existing materials are updated with the new figures; new items
                are added.
              </>
            ) : (
              <>
                The <strong>BookName</strong> (or Item Name / Product Name) column
                and the <strong>Sale Price</strong> column are read.{" "}
                <strong>Opening stock</strong>, <strong>closing stock</strong>,
                location counts, AllTotal, and other columns are ignored.
              </>
            )}
          </p>

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
                <strong>Update catalog</strong> — add new products
                {company === "accessible"
                  ? ", set Sale Price from the file, and reset matching stock to zero"
                  : company === "trifone"
                    ? ", set Cost Price from the file, and reset matching stock to zero"
                    : company === "press"
                      ? " and update QTY USED / stock figures from the file"
                  : " and reset matching ones to zero"}
                ; keep existing products not in the file
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
      ) : null}

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
                    <th>NO</th>
                    <th>{isPress ? "Materials Item" : isItemCatalog ? "Item Name" : "BookName"}</th>
                    {!isItemCatalog ? <th>Sale Price</th> : null}
                    {isTrifone
                      ? trifoneColumns.map((field) => (
                          <th key={field.key}>{field.label}</th>
                        ))
                      : isElectronics
                        ? electronicsColumns.map((field) => (
                            <th key={field.key}>{field.label}</th>
                          ))
                        : isPress
                          ? pressColumns.map((field) => (
                              <th key={field.key}>{field.label}</th>
                            ))
                      : locations.map((loc) => (
                          <th key={loc}>
                            <span className="col-head">
                              <span>{loc}</span>
                              {canManageCatalog ? (
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
                              ) : null}
                            </span>
                          </th>
                        ))}
                    {!isItemCatalog ? <th>AllTotal</th> : null}
                    {canManageCatalog ? <th aria-label="Actions" /> : null}
                  </tr>
                </thead>
                <tbody>
                  {products.map((product, index) => {
                    const pressClosing =
                      product.pressData?.closingStock ?? product.closingStock ?? 0;
                    const pressLow = isPress && isLowStock(pressClosing);

                    return (
                    <tr
                      key={product._id || product.name}
                      className={pressLow ? "low-stock-row" : undefined}
                    >
                      <td>{start + index}</td>
                      <td>{product.name}</td>
                      {!isItemCatalog ? (
                        <td className="num-strong">
                          ₦{formatSalePrice(product.salePrice)}
                        </td>
                      ) : null}
                      {isTrifone
                        ? trifoneColumns.map((field) => (
                            <td key={field.key} className="num-strong">
                              {field.type === "money"
                                ? `₦${formatSalePrice(product.trifoneData?.[field.key])}`
                                : formatCellValue(product.trifoneData?.[field.key])}
                            </td>
                          ))
                        : isElectronics
                          ? electronicsColumns.map((field) => (
                              <td key={field.key} className="num-strong">
                                {formatCellValue(
                                  product.electronicsData?.[field.key] ??
                                    product[field.key]
                                )}
                              </td>
                            ))
                          : isPress
                            ? pressColumns.map((field) => {
                                const value =
                                  product.pressData?.[field.key] ?? product[field.key];
                                const low =
                                  field.key === "closingStock" && isLowStock(value);
                                return (
                                  <td key={field.key} className="num-strong">
                                    <span
                                      className={low ? "low-stock-glow" : undefined}
                                      title={low ? "Low stock — below 10" : undefined}
                                    >
                                      {formatCellValue(value)}
                                    </span>
                                  </td>
                                );
                              })
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
                      {canManageCatalog ? (
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
                      ) : null}
                    </tr>
                    );
                  })}
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
