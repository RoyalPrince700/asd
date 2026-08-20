const Request = require("../models/Request");

const STATUSES = ["pending", "processing", "completed", "rejected"];

const REQUEST_TYPE_IDS = ["credit", "expense", "stock_issues"];

const REQUEST_TYPE_LABELS = {
  credit: "Credit request",
  expense: "Expense request",
  stock_issues: "Stock issues",
};

const STATUS_LABELS = {
  pending: "Pending",
  processing: "Processing",
  completed: "Completed",
  rejected: "Rejected",
};

const STATUS_ORDER = {
  pending: 0,
  processing: 1,
  rejected: 2,
  completed: 3,
};

function resolveStatus(doc) {
  if (doc.status && STATUSES.includes(doc.status)) return doc.status;
  if (doc.done === true) return "completed";
  return "pending";
}

function formatTime12(time) {
  if (!time) return "—";
  const [hourStr, minuteStr = "00"] = String(time).trim().split(":");
  const hour24 = Number(hourStr);
  const minute = minuteStr.padStart(2, "0").slice(0, 2);
  if (!Number.isFinite(hour24)) return time;
  const period = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minute} ${period}`;
}

function requestTypeLabel(value) {
  return REQUEST_TYPE_LABELS[value] || value || "Other";
}

function statusLabel(value) {
  return STATUS_LABELS[value] || value || "Pending";
}

function submitterLabel(user) {
  if (!user?.name) return "—";
  return user.name;
}

function sortKey(doc) {
  return `${doc.date}T${doc.time || "00:00"}`;
}

function buildCategoryStats(id, label, categoryRows) {
  const counts = STATUSES.reduce((acc, status) => {
    acc[status] = categoryRows.filter((row) => row.status === status).length;
    return acc;
  }, {});

  return {
    id,
    label,
    total: categoryRows.length,
    pending: counts.pending,
    processing: counts.processing,
    completed: counts.completed,
    rejected: counts.rejected,
    active: counts.pending + counts.processing + counts.rejected,
  };
}

function submitterFromDoc(doc) {
  const user = doc.submittedBy;
  if (!user) {
    return { name: "—", email: "—", role: "—" };
  }
  if (typeof user === "object" && user.name) {
    return {
      name: user.name,
      email: user.email || "—",
      role: user.role || "—",
    };
  }
  return { name: "Unknown user", email: "—", role: "—" };
}

function mapRequestRow(doc) {
  const status = resolveStatus(doc);
  const categoryId = REQUEST_TYPE_LABELS[doc.request] ? doc.request : "other";
  const submitter = submitterFromDoc(doc);
  return {
    doc,
    status,
    categoryId,
    requestCategory: requestTypeLabel(doc.request),
    requestType: requestTypeLabel(doc.request),
    statusLabel: statusLabel(status),
    date: doc.date || "—",
    time: formatTime12(doc.time),
    dateTime: `${doc.date || "—"} · ${formatTime12(doc.time)}`,
    submittedBy: submitter.name,
    submitterEmail: submitter.email,
    submitterRole: submitter.role,
    submittedAt: doc.createdAt ? new Date(doc.createdAt).toLocaleString() : "—",
    completedAt: doc.completedAt
      ? new Date(doc.completedAt).toLocaleString()
      : "—",
  };
}

function sortExportRows(rows) {
  rows.sort((a, b) => {
    const categoryDiff = a.requestCategory.localeCompare(b.requestCategory);
    if (categoryDiff !== 0) return categoryDiff;

    const statusDiff = (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99);
    if (statusDiff !== 0) return statusDiff;

    if (a.status === "completed") {
      const aAt = a.doc.completedAt || a.doc.updatedAt || a.doc.createdAt;
      const bAt = b.doc.completedAt || b.doc.updatedAt || b.doc.createdAt;
      return new Date(bAt) - new Date(aAt);
    }

    return sortKey(a.doc).localeCompare(sortKey(b.doc));
  });
}

async function loadRequestExportRows() {
  const docs = await Request.find()
    .populate("submittedBy", "name email role")
    .sort({ createdAt: -1 });

  const rows = docs.map(mapRequestRow);
  sortExportRows(rows);
  return rows;
}

function summarizeRequestRows(rows) {
  const counts = STATUSES.reduce((acc, status) => {
    acc[status] = rows.filter((row) => row.status === status).length;
    return acc;
  }, {});

  return {
    total: rows.length,
    pending: counts.pending,
    processing: counts.processing,
    completed: counts.completed,
    rejected: counts.rejected,
    active: counts.pending + counts.processing + counts.rejected,
  };
}

function summarizeByCategory(rows) {
  const categories = REQUEST_TYPE_IDS.map((id) =>
    buildCategoryStats(
      id,
      REQUEST_TYPE_LABELS[id],
      rows.filter((row) => row.categoryId === id)
    )
  );

  const otherRows = rows.filter((row) => row.categoryId === "other");
  if (otherRows.length) {
    categories.push(buildCategoryStats("other", "Other", otherRows));
  }

  return categories;
}

function rowToExportRecord(row) {
  return [
    row.requestCategory,
    row.date,
    row.time,
    row.submittedBy,
    row.submitterEmail,
    row.submitterRole,
    row.statusLabel,
    row.submittedAt,
    row.completedAt,
  ];
}

const DETAIL_HEADERS = [
  "Category",
  "Date",
  "Time",
  "Submitted by",
  "Email",
  "Role",
  "Status",
  "Submitted at",
  "Completed at",
];

module.exports = {
  REQUEST_TYPE_IDS,
  REQUEST_TYPE_LABELS,
  DETAIL_HEADERS,
  loadRequestExportRows,
  summarizeRequestRows,
  summarizeByCategory,
  rowToExportRecord,
  statusLabel,
};
