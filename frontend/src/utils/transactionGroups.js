function n(value) {
  const x = Number(value);
  return Number.isFinite(x) ? x : 0;
}

export function materialKey(name) {
  return String(name || "").trim().toLowerCase();
}

function productKey(row) {
  return materialKey(row.productName);
}

export function placementKey(row) {
  return [
    String(row.company || "").toLowerCase(),
    String(row.location || "").toLowerCase(),
    materialKey(row.productName),
  ].join("\0");
}

function matchesQuery(row, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const stockId = String(row.stockId || "").toLowerCase();
  const name = String(row.productName || "").toLowerCase();
  return stockId.includes(q) || name.includes(q);
}

export function currentMonth() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

export function formatMonth(month) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(month || ""));
  if (!match) return "";
  return new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function recordsInMonth(records, month) {
  const key = String(month || "").trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) return records || [];
  return (records || []).filter((row) => String(row.date || "").slice(0, 7) === key);
}

export function recordsForQuery(records, query, keyOf = productKey) {
  const q = String(query || "").trim();
  if (!q) return records;
  const keys = new Set(
    records.filter((row) => matchesQuery(row, q)).map((row) => keyOf(row))
  );
  return records.filter((row) => keys.has(keyOf(row)));
}

export function groupTransactions(records, keyOf = productKey) {
  const buckets = new Map();
  for (const row of records) {
    const key = keyOf(row);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(row);
  }

  const groups = [];
  for (const [key, rows] of buckets) {
    const chronological = [...rows].sort((a, b) => {
      const byDate = new Date(a.date) - new Date(b.date);
      if (byDate !== 0) return byDate;
      return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    });
    const oldest = chronological[0];
    const newest = chronological[chronological.length - 1];
    const remarks = new Set(chronological.map((row) => row.remark || ""));
    groups.push({
      key,
      name: newest.productName,
      rows: chronological,
      count: chronological.length,
      inbound: chronological.reduce((sum, row) => sum + n(row.inbound), 0),
      outbound: chronological.reduce((sum, row) => sum + n(row.outbound), 0),
      opening: oldest.openingBalance,
      closing: newest.closingBalance,
      date: newest.date,
      company: newest.company,
      location: newest.location,
      remark: remarks.size === 1 ? chronological[0].remark : "",
      pending: chronological.some((row) => row.pendingApproval),
    });
  }

  groups.sort(
    (a, b) => new Date(b.date) - new Date(a.date) || a.name.localeCompare(b.name)
  );
  return groups;
}
