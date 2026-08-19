const Counter = require("../models/Counter");
const StockRecord = require("../models/StockRecord");

const STOCK_ID_PREFIX = "STK";
const STOCK_ID_PAD = 6;
const STOCK_ID_PATTERN = new RegExp(`^${STOCK_ID_PREFIX}-\\d+$`);

function formatStockId(seq) {
  return `${STOCK_ID_PREFIX}-${String(seq).padStart(STOCK_ID_PAD, "0")}`;
}

function parseStockIdSeq(stockId) {
  const match = String(stockId || "").toUpperCase().match(
    new RegExp(`^${STOCK_ID_PREFIX}-(\\d+)$`)
  );
  if (!match) return null;
  const seq = parseInt(match[1], 10);
  return Number.isFinite(seq) ? seq : null;
}

function normalizeStockIdInput(value) {
  const raw = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!raw) return "";

  const digits = raw.replace(new RegExp(`^${STOCK_ID_PREFIX}-?`), "");
  if (/^\d+$/.test(digits) && (raw.startsWith(STOCK_ID_PREFIX) || /^\d+$/.test(raw))) {
    return formatStockId(parseInt(digits, 10));
  }

  return raw;
}

function applyStockIdFilter(filter, query) {
  const stockId = normalizeStockIdInput(query.stockId);
  if (!stockId) return filter;
  filter.stockId = stockId;
  return filter;
}

async function nextStockId() {
  const doc = await Counter.findByIdAndUpdate(
    "stockId",
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return formatStockId(doc.seq);
}

async function syncStockIdCounter() {
  const last = await StockRecord.findOne({ stockId: STOCK_ID_PATTERN })
    .sort({ stockId: -1 })
    .select("stockId")
    .lean();
  const seq = parseStockIdSeq(last?.stockId);
  if (!seq) return;

  await Counter.findByIdAndUpdate(
    "stockId",
    { $max: { seq } },
    { upsert: true }
  );
}

async function backfillStockIds() {
  await StockRecord.updateMany({ stockId: "" }, { $unset: { stockId: 1 } });

  const missing = await StockRecord.find({
    $or: [{ stockId: { $exists: false } }, { stockId: null }],
  }).sort({ createdAt: 1, _id: 1 });

  if (!missing.length) {
    await syncStockIdCounter();
    return { assigned: 0 };
  }

  await syncStockIdCounter();

  let assigned = 0;
  for (const record of missing) {
    record.stockId = await nextStockId();
    await record.save();
    assigned += 1;
  }

  return { assigned };
}

module.exports = {
  formatStockId,
  normalizeStockIdInput,
  applyStockIdFilter,
  nextStockId,
  backfillStockIds,
};
