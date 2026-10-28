import { useState } from "react";
import { api } from "../api";
import { currentMonth } from "../utils/transactionGroups.js";

export function TransactionReportDownload({ params = {}, month, onMonthChange }) {
  const [internalMonth, setInternalMonth] = useState(currentMonth);
  const [downloading, setDownloading] = useState("");
  const [error, setError] = useState("");
  const selectedMonth = month ?? internalMonth;

  function updateMonth(next) {
    if (onMonthChange) onMonthChange(next);
    else setInternalMonth(next);
  }

  async function download(type) {
    if (!selectedMonth) {
      setError("Choose a month to download.");
      return;
    }
    setDownloading(type);
    setError("");
    try {
      await api.downloadTransactionReport(type, { ...params, month: selectedMonth });
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading("");
    }
  }

  return (
    <div className="txn-download">
      <label>
        Month
        <input
          type="month"
          value={selectedMonth}
          onChange={(e) => updateMonth(e.target.value)}
          required
        />
      </label>
      <button
        type="button"
        className="ghost"
        disabled={Boolean(downloading) || !selectedMonth}
        onClick={() => download("docx")}
      >
        {downloading === "docx" ? "Preparing…" : "Download Word"}
      </button>
      <button
        type="button"
        disabled={Boolean(downloading) || !selectedMonth}
        onClick={() => download("excel")}
      >
        {downloading === "excel" ? "Preparing…" : "Download Excel"}
      </button>
      {error ? <p className="alert">{error}</p> : null}
    </div>
  );
}
