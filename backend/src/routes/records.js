const express = require("express");
const StockRecord = require("../models/StockRecord");
const Product = require("../models/Product");
const { protect, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");
const {
  normalizeRecordInput,
  summarizeRecords,
  computeClosingBalance,
} = require("../utils/stock");
const { COMPANIES, isValidCompany, ACCESSIBLE_LOCATIONS, isLocationlessCompany, companyLabel } = require("../constants/companies");
const { isValidProductName } = require("../utils/products");
const { getCurrentStock } = require("../utils/inventory");
const RecordChange = require("../models/RecordChange");
const {
  snapshotRecord,
  findPendingChange,
  pendingChangeMapForRecords,
  attachPendingMeta,
} = require("../utils/recordChanges");
const { applyStockIdFilter, nextStockId } = require("../utils/stockId");

const router = express.Router();

router.use(protect);

function buildFilter(query) {
  const filter = {};
  applyStockIdFilter(filter, query);
  if (filter.stockId) return filter;

  if (query.productName) {
    filter.productName = new RegExp(String(query.productName).trim(), "i");
  }

  if (query.company) {
    filter.company = String(query.company).trim().toLowerCase();
  }

  if (query.from || query.to) {
    filter.date = {};
    if (query.from) filter.date.$gte = new Date(query.from);
    if (query.to) {
      const to = new Date(query.to);
      to.setHours(23, 59, 59, 999);
      filter.date.$lte = to;
    }
  }

  if (query.location) {
    filter.location = String(query.location).trim().toUpperCase();
  }

  return filter;
}

function isAssignedStaff(user) {
  if (isLocationlessCompany(user.assignedCompany)) return true;
  if (user.location) return true;
  return false;
}

function validateAccountantRecordData(data) {
  if (!data.company || !isValidCompany(data.company)) {
    return "Select a company.";
  }

  if (isLocationlessCompany(data.company)) {
    data.location = null;
    return null;
  }

  if (!data.location || !ACCESSIBLE_LOCATIONS.includes(data.location)) {
    return "Select an APL location.";
  }

  return null;
}

function applyClerkScope(data, user, existing = null) {
  if (isLocationlessCompany(user.assignedCompany)) {
    if (data.company !== user.assignedCompany) {
      const label = companyLabel(user.assignedCompany);
      return `Your account is assigned to ${label}. You can only post ${label} records.`;
    }
    data.location = null;
  } else if (user.location) {
    if (data.company !== COMPANIES.ACCESSIBLE) {
      return `Your account is assigned to location ${user.location}. You can only post APL records.`;
    }
    if (existing?.location && existing.location !== user.location) {
      return "You can only edit records for your assigned location.";
    }
    if (existing?.company && existing.company !== COMPANIES.ACCESSIBLE) {
      return "You can only edit APL records.";
    }
    data.location = user.location;
  }

  return null;
}

router.get("/", asyncHandler(async (req, res) => {
  const filter = buildFilter(req.query);

  if (req.user.role === "clerk") {
    filter.enteredBy = req.user._id;
    if (isLocationlessCompany(req.user.assignedCompany)) {
      filter.company = req.user.assignedCompany;
    } else if (req.user.location) {
      filter.company = COMPANIES.ACCESSIBLE;
      filter.location = req.user.location;
    }
  } else if (req.user.role === "accountant") {
    if (!filter.stockId) {
      if (!filter.company) {
        return res.status(400).json({ message: "Company filter is required." });
      }
      if (filter.company === COMPANIES.ACCESSIBLE && !filter.location) {
        return res.status(400).json({ message: "Location filter is required for APL." });
      }
    }
  }

  const page = parseInt(req.query.page, 10);
  const limit = parseInt(req.query.limit, 10);

  if (page > 0 && limit > 0) {
    const total = await StockRecord.countDocuments(filter);
    const records = await StockRecord.find(filter)
      .populate("enteredBy", "name email role")
      .sort({ date: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const pendingMap = await pendingChangeMapForRecords(
      records.map((record) => record._id)
    );

    res.json({
      records: attachPendingMeta(records, pendingMap),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
    return;
  }

  const records = await StockRecord.find(filter)
    .populate("enteredBy", "name email role")
    .sort({ date: -1, createdAt: -1 });

  const pendingMap = await pendingChangeMapForRecords(
    records.map((record) => record._id)
  );

  res.json({ records: attachPendingMeta(records, pendingMap) });
}));

router.get("/products", asyncHandler(async (req, res) => {
  const filter = {
    company: { $in: Object.values(COMPANIES) },
  };

  if (req.query.company && isValidCompany(req.query.company)) {
    filter.company = String(req.query.company).trim().toLowerCase();
  } else if (req.user.role === "clerk") {
    if (isLocationlessCompany(req.user.assignedCompany)) {
      filter.company = req.user.assignedCompany;
    } else if (req.user.location) {
      filter.company = COMPANIES.ACCESSIBLE;
    }
  } else if (req.user.role === "accountant") {
    return res.status(400).json({ message: "Company is required." });
  }

  const products = await Product.find(filter)
    .sort({ name: 1 })
    .select("name company");

  res.json({
    products: products.map((p) => ({ name: p.name, company: p.company })),
  });
}));

router.get("/summary", requireRole("cfo"), asyncHandler(async (req, res) => {
  const filter = buildFilter(req.query);
  const records = await StockRecord.find(filter).sort({ date: 1 });

  const productQuery = {};
  const company = String(req.query.company || "").trim().toLowerCase();
  if (isValidCompany(company)) {
    productQuery.company = company;
  }

  const productCount = await Product.countDocuments(productQuery);

  res.json({
    ...summarizeRecords(records),
    productCount,
  });
}));

router.get("/my-summary", requireRole("clerk"), asyncHandler(async (req, res) => {
  const filter = buildFilter(req.query);
  filter.enteredBy = req.user._id;

  if (isLocationlessCompany(req.user.assignedCompany)) {
    filter.company = req.user.assignedCompany;
  } else if (req.user.location) {
    filter.company = COMPANIES.ACCESSIBLE;
    filter.location = req.user.location;
  }

  const records = await StockRecord.find(filter).sort({ date: 1 });
  const productCount = await Product.countDocuments(
    filter.company ? { company: filter.company } : {}
  );

  res.json({
    ...summarizeRecords(records),
    productCount,
    assignment: {
      company: filter.company || null,
      location: req.user.location || null,
    },
  });
}));

router.post("/", requireRole("clerk", "accountant"), asyncHandler(async (req, res) => {
  if (req.user.role === "clerk" && !isAssignedStaff(req.user)) {
    return res.status(403).json({
      message: "You have not been assigned yet. Contact CFO.",
    });
  }

  const data = normalizeRecordInput(req.body);

  if (!data.productName) {
    return res.status(400).json({ message: "Product is required" });
  }

  let scopeError = null;
  if (req.user.role === "accountant") {
    scopeError = validateAccountantRecordData(data);
  } else {
    if (!data.company || !isValidCompany(data.company)) {
      return res.status(400).json({ message: "Select a company." });
    }
    scopeError = applyClerkScope(data, req.user);
  }

  if (scopeError) {
    return res.status(403).json({ message: scopeError });
  }

  if (!(await isValidProductName(data.productName, data.company))) {
    return res.status(400).json({
      message: "Select a product from the catalog for the chosen company.",
    });
  }

  const openingBalance = await getCurrentStock(
    data.productName,
    data.company,
    null,
    data.location
  );
  data.openingBalance = openingBalance;
  data.closingBalance = computeClosingBalance(data);

  if (data.closingBalance < 0) {
    return res.status(400).json({
      message: "Closing balance cannot be negative. Check in / out quantities.",
    });
  }

  const record = await StockRecord.create({
    ...data,
    stockId: await nextStockId(),
    enteredBy: req.user._id,
  });

  const populated = await record.populate("enteredBy", "name email role");
  res.status(201).json({ record: populated });
}));

router.put("/:id", requireRole("clerk", "accountant"), asyncHandler(async (req, res) => {
  if (req.user.role === "clerk" && !isAssignedStaff(req.user)) {
    return res.status(403).json({
      message: "You have not been assigned yet. Contact CFO.",
    });
  }

  const existing = await StockRecord.findById(req.params.id);

  if (!existing) {
    return res.status(404).json({ message: "Record not found" });
  }

  if (req.user.role === "clerk" && String(existing.enteredBy) !== String(req.user._id)) {
    return res.status(403).json({ message: "You can only edit your own records" });
  }

  const pending = await findPendingChange(existing._id);
  if (pending) {
    return res.status(409).json({
      message:
        "This transaction already has a pending edit awaiting CFO approval.",
    });
  }

  const data = normalizeRecordInput(req.body);

  if (!data.productName) {
    return res.status(400).json({ message: "Product is required" });
  }

  let scopeError = null;
  if (req.user.role === "accountant") {
    scopeError = validateAccountantRecordData(data);
  } else {
    if (!data.company || !isValidCompany(data.company)) {
      return res.status(400).json({ message: "Select a company." });
    }
    scopeError = applyClerkScope(data, req.user, existing);
  }

  if (scopeError) {
    return res.status(403).json({ message: scopeError });
  }

  if (!(await isValidProductName(data.productName, data.company))) {
    return res.status(400).json({
      message: "Select a product from the catalog for the chosen company.",
    });
  }

  const openingBalance = await getCurrentStock(
    data.productName,
    data.company,
    existing._id,
    data.location || existing.location
  );
  data.openingBalance = openingBalance;
  data.closingBalance = computeClosingBalance(data);

  if (data.closingBalance < 0) {
    return res.status(400).json({
      message: "Closing balance cannot be negative. Check in / out quantities.",
    });
  }

  const originalSnapshot = snapshotRecord(existing);

  Object.assign(existing, data);
  await existing.save();

  const change = await RecordChange.create({
    recordId: existing._id,
    originalSnapshot,
    proposed: snapshotRecord(existing),
    submittedBy: req.user._id,
  });

  const populated = await existing.populate("enteredBy", "name email role");
  res.json({
    record: {
      ...populated.toObject(),
      pendingApproval: true,
      pendingChangeId: change._id,
      pendingSubmittedAt: change.createdAt,
    },
    pendingApproval: true,
    changeId: change._id,
    message: "Edit saved and sent to CFO for approval.",
  });
}));

router.delete("/:id", requireRole("clerk", "accountant", "cfo"), asyncHandler(async (req, res) => {
  const existing = await StockRecord.findById(req.params.id);

  if (!existing) {
    return res.status(404).json({ message: "Record not found" });
  }

  if (req.user.role === "clerk" && String(existing.enteredBy) !== String(req.user._id)) {
    return res.status(403).json({ message: "You can only delete your own records" });
  }

  await existing.deleteOne();

  // Pending edits would otherwise survive as review rows the CFO can neither
  // approve nor reject, since both paths require the underlying record.
  await RecordChange.deleteMany({ recordId: existing._id, status: "pending" });

  res.json({ message: "Record deleted" });
}));

module.exports = router;
