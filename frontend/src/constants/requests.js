export const REQUEST_TYPES = [
  { id: "credit", label: "Credit request" },
  { id: "expense", label: "Expense request" },
  { id: "stock_issues", label: "Stock issues" },
];

export const REQUEST_STATUSES = [
  { id: "pending", label: "Pending", pill: "status-pill status-pill--pending" },
  { id: "processing", label: "Processing", pill: "status-pill status-pill--high" },
  { id: "completed", label: "Completed", pill: "status-pill status-pill--done" },
  { id: "rejected", label: "Rejected", pill: "status-pill status-pill--urgent" },
];

export function requestTypeLabel(id) {
  return REQUEST_TYPES.find((item) => item.id === id)?.label || id || "—";
}

export function requestStatusLabel(id) {
  return REQUEST_STATUSES.find((item) => item.id === id)?.label || "Pending";
}

export function requestStatusPill(id) {
  return (
    REQUEST_STATUSES.find((item) => item.id === id)?.pill ||
    "status-pill status-pill--pending"
  );
}

export function currentTimeValue() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

export function currentDateValue() {
  return new Date().toISOString().slice(0, 10);
}

export function formatRequestTime(time) {
  if (!time) return "—";
  const [hourStr, minuteStr = "00"] = String(time).trim().split(":");
  const hour24 = Number(hourStr);
  const minute = minuteStr.padStart(2, "0").slice(0, 2);
  if (!Number.isFinite(hour24)) return time;

  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minute} ${period}`;
}

export function formatRequestDateTime(date, time) {
  if (!date) return "—";
  return `${date} · ${formatRequestTime(time)}`;
}
