const { normalizeTransactionRemark } = require("../constants/transactionRemarks");

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
  const company = String(body.company || "").trim().toLowerCase();
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
    company,
    location: body.location ? String(body.location).trim().toUpperCase() : null,
    date,
    openingBalance,
    inbound,
    outbound,
    remark: normalizeTransactionRemark(body.remark),
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

  const byCompanyMap = new Map();
  for (const row of records) {
    const key = row.company || "unknown";
    const current = byCompanyMap.get(key) || {
      company: key,
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
    byCompanyMap.set(key, current);
  }

  return {
    totals,
    byProduct: [...byProductMap.values()].sort((a, b) =>
      a.productName.localeCompare(b.productName)
    ),
    byCompany: [...byCompanyMap.values()].sort((a, b) =>
      a.company.localeCompare(b.company)
    ),
    byDate: [...byDateMap.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}

async function summarizeRecordsFromDb(StockRecord, filter = {}) {
  const [result] = await StockRecord.aggregate([
    { $match: filter },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              openingBalance: { $sum: "$openingBalance" },
              inbound: { $sum: "$inbound" },
              outbound: { $sum: "$outbound" },
              stockReceived: { $sum: "$stockReceived" },
              stockOut: { $sum: "$stockOut" },
              closingBalance: { $sum: "$closingBalance" },
              recordCount: { $sum: 1 },
            },
          },
        ],
        byProduct: [
          {
            $group: {
              _id: "$productName",
              openingBalance: { $sum: "$openingBalance" },
              inbound: { $sum: "$inbound" },
              outbound: { $sum: "$outbound" },
              stockReceived: { $sum: "$stockReceived" },
              stockOut: { $sum: "$stockOut" },
              closingBalance: { $sum: "$closingBalance" },
              recordCount: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
          {
            $project: {
              _id: 0,
              productName: "$_id",
              openingBalance: 1,
              inbound: 1,
              outbound: 1,
              stockReceived: 1,
              stockOut: 1,
              closingBalance: 1,
              recordCount: 1,
            },
          },
        ],
        byCompany: [
          {
            $group: {
              _id: { $ifNull: ["$company", "unknown"] },
              openingBalance: { $sum: "$openingBalance" },
              inbound: { $sum: "$inbound" },
              outbound: { $sum: "$outbound" },
              stockReceived: { $sum: "$stockReceived" },
              stockOut: { $sum: "$stockOut" },
              closingBalance: { $sum: "$closingBalance" },
              recordCount: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
          {
            $project: {
              _id: 0,
              company: "$_id",
              openingBalance: 1,
              inbound: 1,
              outbound: 1,
              stockReceived: 1,
              stockOut: 1,
              closingBalance: 1,
              recordCount: 1,
            },
          },
        ],
        byDate: [
          {
            $group: {
              _id: {
                $dateToString: {
                  format: "%Y-%m-%d",
                  date: "$date",
                  timezone: "UTC",
                },
              },
              inbound: { $sum: "$inbound" },
              outbound: { $sum: "$outbound" },
              stockReceived: { $sum: "$stockReceived" },
              stockOut: { $sum: "$stockOut" },
              closingBalance: { $sum: "$closingBalance" },
            },
          },
          { $sort: { _id: 1 } },
          {
            $project: {
              _id: 0,
              date: "$_id",
              inbound: 1,
              outbound: 1,
              stockReceived: 1,
              stockOut: 1,
              closingBalance: 1,
            },
          },
        ],
      },
    },
  ]).allowDiskUse(true);

  const totals = result?.totals?.[0] || {
    openingBalance: 0,
    inbound: 0,
    outbound: 0,
    stockReceived: 0,
    stockOut: 0,
    closingBalance: 0,
    recordCount: 0,
  };
  delete totals._id;
  totals.netMovement =
    totals.inbound + totals.stockReceived - totals.outbound - totals.stockOut;

  return {
    totals,
    byProduct: result?.byProduct || [],
    byCompany: result?.byCompany || [],
    byDate: result?.byDate || [],
  };
}

module.exports = {
  computeClosingBalance,
  normalizeRecordInput,
  summarizeRecords,
  summarizeRecordsFromDb,
};
