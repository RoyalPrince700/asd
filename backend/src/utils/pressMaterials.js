const Product = require("../models/Product");
const StockRecord = require("../models/StockRecord");
const PressMaterialRequest = require("../models/PressMaterialRequest");
const { COMPANIES } = require("../constants/companies");
const { normalizeTransactionRemark } = require("../constants/transactionRemarks");
const { computeClosingBalance } = require("./stock");
const { nextStockIds } = require("./stockId");

function nameKey(name) {
  return String(name || "").trim().toLowerCase();
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function httpError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}

async function findPressProductByName(name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return null;
  return Product.findOne({
    company: COMPANIES.PRESS,
    name: new RegExp(`^${escapeRegex(trimmed)}$`, "i"),
  }).select("_id name");
}

async function queuePressMaterials(items, options) {
  const submittedBy = options.submittedBy;
  const date = options.date ? new Date(options.date) : new Date();
  const remark = normalizeTransactionRemark(options.remark);
  const source = options.source === "upload" ? "upload" : "manual";
  const skipped = [];
  const accepted = [];
  const seen = new Set();

  for (const item of items) {
    const name = String(item.name || "").trim();
    const key = nameKey(name);
    const inbound = Math.max(0, Math.round(Number(item.inbound) || 0));
    const outbound = Math.max(0, Math.round(Number(item.outbound) || 0));

    if (!key) {
      skipped.push({ name, message: "Raw material name is required." });
      continue;
    }

    if (seen.has(key)) {
      const first = accepted.find((row) => row.nameKey === key);
      if (first) {
        first.inbound += inbound;
        first.outbound += outbound;
      }
      continue;
    }

    seen.add(key);
    accepted.push({ name, nameKey: key, inbound, outbound });
  }

  const readyToCheck = [];
  for (const row of accepted) {
    const closing = computeClosingBalance({
      openingBalance: 0,
      inbound: row.inbound,
      outbound: row.outbound,
      stockReceived: 0,
      stockOut: 0,
    });
    if (closing < 0) {
      skipped.push({
        name: row.name,
        message: "Out cannot be greater than In for a new raw material.",
      });
      continue;
    }
    readyToCheck.push({ ...row, closing });
  }

  if (!readyToCheck.length) {
    return { created: [], skipped };
  }

  const names = readyToCheck.map((row) => row.name);
  const keys = readyToCheck.map((row) => row.nameKey);
  const [products, pending] = await Promise.all([
    Product.find({ company: COMPANIES.PRESS, name: { $in: names } })
      .collation({ locale: "en", strength: 2 })
      .select("name")
      .lean(),
    PressMaterialRequest.find({ status: "pending", nameKey: { $in: keys } })
      .select("nameKey")
      .lean(),
  ]);

  const productKeys = new Set(products.map((product) => nameKey(product.name)));
  const pendingKeys = new Set(pending.map((row) => row.nameKey));
  const ready = [];

  for (const row of readyToCheck) {
    if (productKeys.has(row.nameKey)) {
      skipped.push({
        name: row.name,
        message: "This raw material is already in the catalog.",
      });
      continue;
    }
    if (pendingKeys.has(row.nameKey)) {
      skipped.push({
        name: row.name,
        message: "This raw material is already awaiting press manager approval.",
      });
      continue;
    }
    ready.push(row);
  }

  if (!ready.length) {
    return { created: [], skipped };
  }

  const stockIds = await nextStockIds(ready.length);
  const docs = ready.map((row, index) => ({
    name: row.name,
    nameKey: row.nameKey,
    stockId: stockIds[index],
    date,
    inbound: row.inbound,
    outbound: row.outbound,
    remark,
    openingBalance: 0,
    closingBalance: row.closing,
    status: "pending",
    source,
    submittedBy,
  }));

  const created = await PressMaterialRequest.insertMany(docs);
  return { created, skipped };
}

async function approvePressMaterial(id, reviewerId) {
  const existing = await PressMaterialRequest.findById(id);
  if (!existing) throw httpError("Material request not found.", 404);
  if (existing.status !== "pending") {
    throw httpError("This raw material has already been reviewed.", 409);
  }

  const productExists = await findPressProductByName(existing.name);
  if (productExists) {
    throw httpError("This raw material is already in the catalog.", 409);
  }

  const claimed = await PressMaterialRequest.findOneAndUpdate(
    { _id: existing._id, status: "pending" },
    { status: "approved", reviewedBy: reviewerId, reviewedAt: new Date() },
    { new: true }
  );
  if (!claimed) {
    throw httpError("This raw material has already been reviewed.", 409);
  }

  let product = null;
  try {
    product = await Product.create({
      name: claimed.name,
      company: COMPANIES.PRESS,
      pressData: { openingStock: 0, closingStock: claimed.closingBalance },
      uploadedBy: claimed.submittedBy,
    });
    await StockRecord.create({
      stockId: claimed.stockId,
      productName: claimed.name,
      company: COMPANIES.PRESS,
      location: null,
      date: claimed.date,
      openingBalance: 0,
      inbound: claimed.inbound,
      outbound: claimed.outbound,
      remark: claimed.remark,
      stockReceived: 0,
      stockOut: 0,
      closingBalance: claimed.closingBalance,
      enteredBy: claimed.submittedBy,
    });
  } catch (err) {
    if (product) await Product.deleteOne({ _id: product._id });
    await PressMaterialRequest.updateOne(
      { _id: claimed._id },
      { $set: { status: "pending", reviewedBy: null, reviewedAt: null } }
    );
    if (err.code === 11000) {
      throw httpError("This raw material or stock ID is already in use.", 409);
    }
    throw err;
  }

  return claimed;
}

async function rejectPressMaterial(id, reviewerId) {
  const updated = await PressMaterialRequest.findOneAndUpdate(
    { _id: id, status: "pending" },
    { status: "rejected", reviewedBy: reviewerId, reviewedAt: new Date() },
    { new: true }
  );
  if (updated) return updated;

  const current = await PressMaterialRequest.findById(id);
  if (!current) throw httpError("Material request not found.", 404);
  throw httpError("This raw material has already been reviewed.", 409);
}

module.exports = {
  nameKey,
  queuePressMaterials,
  approvePressMaterial,
  rejectPressMaterial,
};
