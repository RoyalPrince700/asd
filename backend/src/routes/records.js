const express = require("express");
const multer = require("multer");
const StockRecord = require("../models/StockRecord");
const Product = require("../models/Product");
const { protect, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");
const {
  normalizeRecordInput,
  summarizeRecordsFromDb,
  computeClosingBalance,
} = require("../utils/stock");
const { COMPANIES, isValidCompany, ACCESSIBLE_LOCATIONS, isLocationlessCompany, isTrifoneCompany, isPressCompany, TRIFONE_ROLE_COMPANIES, companyLabel } = require("../constants/companies");
const { isValidProductName } = require("../utils/products");
const { getCurrentStock } = require("../utils/inventory");
const RecordChange = require("../models/RecordChange");
const { logRecordDeletion, rollbackDeletionLogs } = require("../utils/deletionLog");
const {
  snapshotRecord,
  findPendingChange,
  pendingChangeMapForRecords,
  attachPendingMeta,
} = require("../utils/recordChanges");
const { applyStockIdFilter, nextStockId } = require("../utils/stockId");
const {
  parseMovementExcel,
  parsePressMovementExcel,
  importMovementRows,
} = require("../utils/movementImport");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      /\.xlsx?$/i.test(file.originalname) ||
      file.mimetype ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.mimetype === "application/vnd.ms-excel";
    cb(null, ok);
  },
});

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

function validateTrifoneRecordData(data) {
  if (!data.company || !isTrifoneCompany(data.company)) {
    return "Select Trifone Gadgets or Trifone Electronics.";
  }
  data.location = null;
  return null;
}

function validatePressRecordData(data) {
  if (!data.company || !isPressCompany(data.company)) {
    return "Select Press raw materials.";
  }
  data.location = null;
  return null;
}

function applyRecordsListScope(filter, user, query) {
  if (user.role === "clerk") {
    filter.enteredBy = user._id;
    if (isLocationlessCompany(user.assignedCompany)) {
      filter.company = user.assignedCompany;
    } else if (user.location) {
      filter.company = COMPANIES.ACCESSIBLE;
      filter.location = user.location;
    }
    return null;
  }

  if (user.role === "accountant") {
    if (!filter.stockId) {
      if (!filter.company) {
        return "Company filter is required.";
      }
      if (filter.company === COMPANIES.ACCESSIBLE && !filter.location) {
        return "Location filter is required for APL.";
      }
    }
    return null;
  }

  if (user.role === "trifone") {
    if (!filter.stockId) {
      if (!filter.company) {
        return "Company filter is required.";
      }
      if (!isTrifoneCompany(filter.company)) {
        return "Company must be Trifone Gadgets or Trifone Electronics.";
      }
    }
    return null;
  }

  if (user.role === "press") {
    filter.enteredBy = user._id;
    filter.company = COMPANIES.PRESS;
    return null;
  }

  if (user.role === "press_manager") {
    filter.company = COMPANIES.PRESS;
    return null;
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
  const scopeError = applyRecordsListScope(filter, req.user, req.query);
  if (scopeError) {
    return res.status(400).json({ message: scopeError });
  }

  const page = parseInt(req.query.page, 10);
  const limit = parseInt(req.query.limit, 10);

  if (page > 0 && limit > 0) {
    const safeLimit = Math.min(100, Math.max(1, limit));
    const [total, records] = await Promise.all([
      StockRecord.countDocuments(filter),
      StockRecord.find(filter)
        .populate("enteredBy", "name email role")
        .sort({ date: -1, createdAt: -1 })
        .skip((page - 1) * safeLimit)
        .limit(safeLimit)
        .lean(),
    ]);

    const pendingMap = await pendingChangeMapForRecords(
      records.map((record) => record._id)
    );

    res.json({
      records: attachPendingMeta(records, pendingMap),
      total,
      page,
      limit: safeLimit,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    });
    return;
  }

  const records = await StockRecord.find(filter)
    .populate("enteredBy", "name email role")
    .sort({ date: -1, createdAt: -1 })
    .lean();

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
  } else if (req.user.role === "trifone") {
    if (req.query.company && isTrifoneCompany(req.query.company)) {
      filter.company = String(req.query.company).trim().toLowerCase();
    } else {
      filter.company = { $in: TRIFONE_ROLE_COMPANIES };
    }
  } else if (req.user.role === "press" || req.user.role === "press_manager") {
    filter.company = COMPANIES.PRESS;
  }

  const products = await Product.find(filter)
    .sort({ name: 1 })
    .select("name company");

  res.json({
    products: products.map((p) => ({ name: p.name, company: p.company })),
  });
}));

router.get("/summary", requireRole("cfo", "md"), asyncHandler(async (req, res) => {
  const filter = buildFilter(req.query);

  const productQuery = {};
  const company = String(req.query.company || "").trim().toLowerCase();
  if (isValidCompany(company)) {
    productQuery.company = company;
  }

  const [summary, productCount] = await Promise.all([
    summarizeRecordsFromDb(StockRecord, filter),
    Product.countDocuments(productQuery),
  ]);

  res.json({
    ...summary,
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

  const [summary, productCount] = await Promise.all([
    summarizeRecordsFromDb(StockRecord, filter),
    Product.countDocuments(filter.company ? { company: filter.company } : {}),
  ]);

  res.json({
    ...summary,
    productCount,
    assignment: {
      company: filter.company || null,
      location: req.user.location || null,
    },
  });
}));

router.post(
  "/upload",
  requireRole("clerk", "accountant", "trifone", "press"),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (req.user.role === "clerk" && !isAssignedStaff(req.user)) {
      return res.status(403).json({
        message: "You have not been assigned yet. Contact CFO.",
      });
    }

    if (!req.file?.buffer) {
      return res.status(400).json({ message: "Choose an Excel file to upload." });
    }

    const data = {
      company: String(req.body.company || "").trim().toLowerCase(),
      location: req.body.location
        ? String(req.body.location).trim().toUpperCase()
        : null,
      date: req.body.date ? new Date(req.body.date) : new Date(),
    };

    let scopeError = null;
    if (req.user.role === "accountant") {
      scopeError = validateAccountantRecordData(data);
    } else if (req.user.role === "trifone") {
      scopeError = validateTrifoneRecordData(data);
    } else if (req.user.role === "press") {
      scopeError = validatePressRecordData(data);
    } else {
      if (!data.company || !isValidCompany(data.company)) {
        return res.status(400).json({ message: "Select a company." });
      }
      scopeError = applyClerkScope(data, req.user);
    }

    if (scopeError) {
      return res.status(403).json({ message: scopeError });
    }

    let rows;
    const pressFormat = data.company === COMPANIES.PRESS;
    try {
      rows = pressFormat
        ? await parsePressMovementExcel(req.file.buffer)
        : await parseMovementExcel(req.file.buffer);
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }

    const results = await importMovementRows(rows, {
      company: data.company,
      location: data.location,
      date: data.date,
      enteredBy: req.user._id,
      pressFormat,
    });

    const parts = [`${results.imported} transaction${results.imported === 1 ? "" : "s"} imported.`];
    if (results.created) {
      parts.push(
        `${results.created} new material${results.created === 1 ? "" : "s"} added to catalog.`
      );
    }
    if (results.pending) {
      parts.push(
        `${results.pending} new material${results.pending === 1 ? "" : "s"} sent to the press manager for approval.`
      );
    }
    if (results.reconciled) {
      parts.push(
        `${results.reconciled} opening balance${results.reconciled === 1 ? "" : "s"} reconciled.`
      );
    }
    if (results.skipped) {
      parts.push(`${results.skipped} row${results.skipped === 1 ? "" : "s"} skipped.`);
    }

    res.json({
      message: parts.join(" "),
      ...results,
    });
  })
);

router.post("/", requireRole("clerk", "accountant", "trifone", "press"), asyncHandler(async (req, res) => {
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
  } else if (req.user.role === "trifone") {
    scopeError = validateTrifoneRecordData(data);
  } else if (req.user.role === "press") {
    scopeError = validatePressRecordData(data);
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

router.put("/:id", requireRole("clerk", "accountant", "trifone", "press"), asyncHandler(async (req, res) => {
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

  if (req.user.role === "trifone" && !isTrifoneCompany(existing.company)) {
    return res.status(403).json({
      message: "You can only edit Trifone Gadgets or Trifone Electronics records.",
    });
  }

  if (req.user.role === "press") {
    if (!isPressCompany(existing.company)) {
      return res.status(403).json({
        message: "You can only edit Press raw material records.",
      });
    }
    if (String(existing.enteredBy) !== String(req.user._id)) {
      return res.status(403).json({ message: "You can only edit your own records" });
    }
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
  } else if (req.user.role === "trifone") {
    scopeError = validateTrifoneRecordData(data);
  } else if (req.user.role === "press") {
    scopeError = validatePressRecordData(data);
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

router.delete("/:id", requireRole("clerk", "accountant", "trifone", "press", "cfo"), asyncHandler(async (req, res) => {
  const existing = await StockRecord.findById(req.params.id);

  if (!existing) {
    return res.status(404).json({ message: "Record not found" });
  }

  if (req.user.role === "clerk" && String(existing.enteredBy) !== String(req.user._id)) {
    return res.status(403).json({ message: "You can only delete your own records" });
  }

  if (req.user.role === "trifone" && !isTrifoneCompany(existing.company)) {
    return res.status(403).json({
      message: "You can only delete Trifone Gadgets or Trifone Electronics records.",
    });
  }

  if (req.user.role === "press") {
    if (!isPressCompany(existing.company)) {
      return res.status(403).json({
        message: "You can only delete Press raw material records.",
      });
    }
    if (String(existing.enteredBy) !== String(req.user._id)) {
      return res.status(403).json({ message: "You can only delete your own records" });
    }
  }

  let logs = null;
  try {
    logs = await logRecordDeletion(existing, req.user._id, {
      press: req.user.role === "press",
    });
    await existing.deleteOne();
  } catch (err) {
    if (logs) await rollbackDeletionLogs(logs);
    throw err;
  }

  // Pending edits would otherwise survive as review rows the CFO can neither
  // approve nor reject, since both paths require the underlying record.
  await RecordChange.deleteMany({ recordId: existing._id, status: "pending" });

  res.json({ message: "Record deleted" });
}));

module.exports = router;
