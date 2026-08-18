function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function computeClosingBalance(fields) {
  const opening = toNumber(fields.openingBalance);
  const inbound = toNumber(fields.inbound);
  const received = toNumber(fields.stockReceived);
  const outbound = toNumber(fields.outbound);
  const stockOut = toNumber(fields.stockOut);
  return opening + inbound + received - outbound - stockOut;
}

function normalizeRecordInput(body) {
  const productName = String(body.productName || "").trim();
  const category = String(body.category || "").trim();
  const date = body.date ? new Date(body.date) : new Date();
  const openingBalance = toNumber(body.openingBalance);
  const inbound = toNumber(body.inbound ?? body.in);
  const outbound = toNumber(body.outbound ?? body.out);
  const stockReceived = toNumber(body.stockReceived);
  const stockOut = toNumber(body.stockOut);
  const closingBalance = computeClosingBalance({
    openingBalance,
    inbound,
    outbound,
    stockReceived,
    stockOut,
  });

  return {
    productName,
    category,
    date,
    openingBalance,
    inbound,
    outbound,
    stockReceived,
    stockOut,
    closingBalance,
  };
}

function summarizeRecords(records) {
  const totals = records.reduce(
    (acc, row) => {
      acc.openingBalance += row.openingBalance;
      acc.inbound += row.inbound;
      acc.outbound += row.outbound;
      acc.stockReceived += row.stockReceived;
      acc.stockOut += row.stockOut;
      acc.closingBalance += row.closingBalance;
      return acc;
    },
    {
      openingBalance: 0,
      inbound: 0,
      outbound: 0,
      stockReceived: 0,
      stockOut: 0,
      closingBalance: 0,
    }
  );

  totals.netMovement =
    totals.inbound + totals.stockReceived - totals.outbound - totals.stockOut;
  totals.recordCount = records.length;

  const byProductMap = new Map();
  for (const row of records) {
    const current = byProductMap.get(row.productName) || {
      productName: row.productName,
      openingBalance: 0,
      inbound: 0,
      outbound: 0,
      stockReceived: 0,
      stockOut: 0,
      closingBalance: 0,
      recordCount: 0,
    };
    current.openingBalance += row.openingBalance;
    current.inbound += row.inbound;
    current.outbound += row.outbound;
    current.stockReceived += row.stockReceived;
    current.stockOut += row.stockOut;
    current.closingBalance += row.closingBalance;
    current.recordCount += 1;
    byProductMap.set(row.productName, current);
  }

  const byDateMap = new Map();
  for (const row of records) {
    const key = new Date(row.date).toISOString().slice(0, 10);
    const current = byDateMap.get(key) || {
      date: key,
      inbound: 0,
      outbound: 0,
      stockReceived: 0,
      stockOut: 0,
      closingBalance: 0,
    };
    current.inbound += row.inbound;
    current.outbound += row.outbound;
    current.stockReceived += row.stockReceived;
    current.stockOut += row.stockOut;
    current.closingBalance += row.closingBalance;
    byDateMap.set(key, current);
  }

  const byCategoryMap = new Map();
  for (const row of records) {
    const key = row.category || "Uncategorized";
    const current = byCategoryMap.get(key) || {
      category: key,
      openingBalance: 0,
      inbound: 0,
      outbound: 0,
      stockReceived: 0,
      stockOut: 0,
      closingBalance: 0,
      recordCount: 0,
    };
    current.openingBalance += row.openingBalance;
    current.inbound += row.inbound;
    current.outbound += row.outbound;
    current.stockReceived += row.stockReceived;
    current.stockOut += row.stockOut;
    current.closingBalance += row.closingBalance;
    current.recordCount += 1;
    byCategoryMap.set(key, current);
  }

  return {
    totals,
    byProduct: [...byProductMap.values()].sort((a, b) =>
      a.productName.localeCompare(b.productName)
    ),
    byCategory: [...byCategoryMap.values()].sort((a, b) =>
      a.category.localeCompare(b.category)
    ),
    byDate: [...byDateMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

module.exports = {
  computeClosingBalance,
  normalizeRecordInput,
  summarizeRecords,
};
