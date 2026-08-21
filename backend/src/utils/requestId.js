const Counter = require("../models/Counter");
const Request = require("../models/Request");

const REQUEST_ID_PREFIX = "REQ";
const REQUEST_ID_PAD = 6;
const REQUEST_ID_PATTERN = new RegExp(`^${REQUEST_ID_PREFIX}-\\d+$`);

function formatRequestId(seq) {
  return `${REQUEST_ID_PREFIX}-${String(seq).padStart(REQUEST_ID_PAD, "0")}`;
}

function parseRequestIdSeq(requestId) {
  const match = String(requestId || "").toUpperCase().match(
    new RegExp(`^${REQUEST_ID_PREFIX}-(\\d+)$`)
  );
  if (!match) return null;
  const seq = parseInt(match[1], 10);
  return Number.isFinite(seq) ? seq : null;
}

function normalizeRequestIdInput(value) {
  const raw = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (!raw) return "";

  const digits = raw.replace(new RegExp(`^${REQUEST_ID_PREFIX}-?`), "");
  if (/^\d+$/.test(digits) && (raw.startsWith(REQUEST_ID_PREFIX) || /^\d+$/.test(raw))) {
    return formatRequestId(parseInt(digits, 10));
  }

  return raw;
}

async function nextRequestId() {
  const doc = await Counter.findByIdAndUpdate(
    "requestId",
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return formatRequestId(doc.seq);
}

async function syncRequestIdCounter() {
  const last = await Request.findOne({ requestId: REQUEST_ID_PATTERN })
    .sort({ requestId: -1 })
    .select("requestId")
    .lean();
  const seq = parseRequestIdSeq(last?.requestId);
  if (!seq) return;

  await Counter.findByIdAndUpdate(
    "requestId",
    { $max: { seq } },
    { upsert: true }
  );
}

async function backfillRequestIds() {
  await Request.updateMany({ requestId: "" }, { $unset: { requestId: 1 } });

  const missing = await Request.find({
    $or: [{ requestId: { $exists: false } }, { requestId: null }],
  }).sort({ createdAt: 1, _id: 1 });

  if (!missing.length) {
    await syncRequestIdCounter();
    return { assigned: 0 };
  }

  await syncRequestIdCounter();

  let assigned = 0;
  for (const doc of missing) {
    doc.requestId = await nextRequestId();
    await doc.save();
    assigned += 1;
  }

  return { assigned };
}

module.exports = {
  formatRequestId,
  normalizeRequestIdInput,
  nextRequestId,
  backfillRequestIds,
};
