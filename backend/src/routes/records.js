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
const { COMPANIES, isValidCompany, ACCESSIBLE_LOCATIONS } = require("../constants/companies");
const { isValidProductName } = require("../utils/products");
const { getCurrentStock } = require("../utils/inventory");

const router = express.Router();

router.use(protect);

function buildFilter(query) {
  const filter = {};

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

router.get("/", asyncHandler(async (req, res) => {
  const filter = buildFilter(req.query);

  if (req.user.role === "clerk") {
    filter.enteredBy = req.user._id;
    if (req.user.assignedCompany === COMPANIES.TRIFONE) {
      filter.company = COMPANIES.TRIFONE;
    } else if (req.user.location) {
      filter.company = COMPANIES.ACCESSIBLE;
      filter.location = req.user.location;
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

    res.json({
      records,
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

  res.json({ records });
}));

router.get("/products", asyncHandler(async (req, res) => {
  const filter = {
    company: { $in: [COMPANIES.ACCESSIBLE, COMPANIES.TRIFONE] },
  };

  if (req.query.company && isValidCompany(req.query.company)) {
    filter.company = String(req.query.company).trim().toLowerCase();
  } else if (req.user.role === "clerk") {
    if (req.user.assignedCompany === COMPANIES.TRIFONE) {
      filter.company = COMPANIES.TRIFONE;
    } else if (req.user.location) {
      filter.company = COMPANIES.ACCESSIBLE;
    }
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
  res.json(summarizeRecords(records));
}));

router.get("/my-summary", requireRole("clerk"), asyncHandler(async (req, res) => {
  const filter = buildFilter(req.query);
  filter.enteredBy = req.user._id;

  if (req.user.assignedCompany === COMPANIES.TRIFONE) {
    filter.company = COMPANIES.TRIFONE;
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

function isAssignedStaff(user) {
  if (user.assignedCompany === COMPANIES.TRIFONE) return true;
  if (user.location) return true;
  return false;
}

router.post("/", requireRole("clerk"), asyncHandler(async (req, res) => {
  if (!isAssignedStaff(req.user)) {
    return res.status(403).json({
      message: "You have not been assigned yet. Contact CFO.",
    });
  }

  const data = normalizeRecordInput(req.body);

  if (!data.productName) {
    return res.status(400).json({ message: "Product is required" });
  }

  if (!data.company || !isValidCompany(data.company)) {
    return res.status(400).json({ message: "Select APL or Trifone." });
  }

  if (req.user.assignedCompany === COMPANIES.TRIFONE) {
    if (data.company !== COMPANIES.TRIFONE) {
      return res.status(403).json({
        message: "Your account is assigned to Trifone. You can only post Trifone records.",
      });
    }
    data.location = null;
  } else if (req.user.location) {
    if (data.company !== COMPANIES.ACCESSIBLE) {
      return res.status(403).json({
        message: `Your account is assigned to location ${req.user.location}. You can only post APL records.`,
      });
    }
    data.location = req.user.location;
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
    enteredBy: req.user._id,
  });

  const populated = await record.populate("enteredBy", "name email role location");
  res.status(201).json({ record: populated });
}));

router.put("/:id", requireRole("clerk"), asyncHandler(async (req, res) => {
  if (!isAssignedStaff(req.user)) {
    return res.status(403).json({
      message: "You have not been assigned yet. Contact CFO.",
    });
  }

  const existing = await StockRecord.findById(req.params.id);

  if (!existing) {
    return res.status(404).json({ message: "Record not found" });
  }

  if (String(existing.enteredBy) !== String(req.user._id)) {
    return res.status(403).json({ message: "You can only edit your own records" });
  }

  const data = normalizeRecordInput(req.body);

  if (!data.productName) {
    return res.status(400).json({ message: "Product is required" });
  }

  if (!data.company || !isValidCompany(data.company)) {
    return res.status(400).json({ message: "Select APL or Trifone." });
  }

  if (req.user.assignedCompany === COMPANIES.TRIFONE) {
    if (data.company !== COMPANIES.TRIFONE) {
      return res.status(403).json({
        message: "Your account is assigned to Trifone. You can only edit Trifone records.",
      });
    }
    if (existing.company !== COMPANIES.TRIFONE) {
      return res.status(403).json({ message: "You can only edit Trifone records." });
    }
    data.location = null;
  } else if (req.user.location) {
    if (data.company !== COMPANIES.ACCESSIBLE) {
      return res.status(403).json({
        message: `Your account is assigned to location ${req.user.location}. You can only edit APL records.`,
      });
    }
    if (existing.location && existing.location !== req.user.location) {
      return res.status(403).json({ message: "You can only edit records for your assigned location." });
    }
    data.location = req.user.location;
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

  Object.assign(existing, data);
  await existing.save();
  const populated = await existing.populate("enteredBy", "name email role location");
  res.json({ record: populated });
}));

router.delete("/:id", requireRole("clerk"), asyncHandler(async (req, res) => {
  const existing = await StockRecord.findById(req.params.id);

  if (!existing) {
    return res.status(404).json({ message: "Record not found" });
  }

  if (String(existing.enteredBy) !== String(req.user._id)) {
    return res.status(403).json({ message: "You can only delete your own records" });
  }

  await existing.deleteOne();
  res.json({ message: "Record deleted" });
}));

module.exports = router;
