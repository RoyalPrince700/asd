import { useRef, useState } from "react";
import { api } from "../api";
import { useDialog } from "../context/DialogContext.jsx";
import { companyLabel } from "../constants/companies";

export function MovementUpload({
  company,
  location,
  date,
  scopeReady = true,
  onSuccess,
}) {
  const { confirm, toast } = useDialog();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");

  function onFileChange(e) {
    const file = e.target.files?.[0];
    setFileName(file?.name || "");
    setError("");
  }

  function chooseFile() {
    fileRef.current?.click();
  }

  function clearFile() {
    if (fileRef.current) fileRef.current.value = "";
    setFileName("");
  }

  async function onUpload(e) {
    e.preventDefault();
    if (!scopeReady || busy) return;

    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Choose an Excel file first.");
      return;
    }

    const scopeLabel = location
      ? `${companyLabel(company, { short: true })} · ${location}`
      : companyLabel(company, { short: true });

    const ok = await confirm({
      title: "Upload stock movements",
      message: `Import stock movements from the Excel file for ${scopeLabel} on ${date}? Products must already exist in the catalog. Opening balances that differ from the platform will be reconciled.`,
      confirmLabel: "Upload",
    });
    if (!ok) return;

    setBusy(true);
    setError("");

    let result;
    try {
      result = await api.uploadRecords(file, {
        company,
        location,
        date,
      });
    } catch (err) {
      setError(err.message);
      setBusy(false);
      return;
    }

    setBusy(false);
    clearFile();

    toast({ message: result.message, type: "success" });

    if (result.errors?.length) {
      toast({
        message: `${result.errors.length} row(s) were skipped. Check that product names match the catalog and ClBal = OpBal + RecQty − IssueQty.`,
        type: "info",
        duration: 8000,
      });
    }

    try {
      await onSuccess?.(result);
    } catch (err) {
      setError(err.message || "Upload finished but the list could not refresh.");
    }
  }

  return (
    <section className="entry-card upload-card">
      <div className="section-head">
        <h2>Bulk upload</h2>
      </div>

      <form className="upload-form" onSubmit={onUpload}>
        <div className="file-picker">
          <span className="file-picker-label">Excel file (.xlsx)</span>
          <div className="file-picker-row">
            <input
              ref={fileRef}
              type="file"
              className="file-picker-input"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={onFileChange}
            />
            <button
              type="button"
              className="ghost file-picker-btn"
              onClick={chooseFile}
              disabled={busy}
            >
              Choose file
            </button>
            <span className="file-picker-name">
              {fileName || "No file chosen"}
            </span>
            {fileName ? (
              <button
                type="button"
                className="text-btn file-picker-clear"
                onClick={clearFile}
                disabled={busy}
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>

        <p className="hint">
          We read only these columns from your Excel file: <strong>Title Name</strong>,{" "}
          <strong>OpBal</strong>, <strong>RecQty</strong>, <strong>IssueQty</strong>, and{" "}
          <strong>ClBal</strong>. All other columns and rows above the header are ignored.
          Title Name must match catalog products. If OpBal differs from the platform, the
          uploaded opening balance is applied before recording the movement. All rows use
          the date selected above ({date}).
        </p>

        {error ? <p className="alert">{error}</p> : null}

        <div className="actions">
          <button type="submit" disabled={busy || !scopeReady || !fileName}>
            {busy ? "Uploading…" : "Upload movements"}
          </button>
        </div>
      </form>
    </section>
  );
}
