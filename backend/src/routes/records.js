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
const { isValidProductName } = require("../utils/products");
const { isValidCategory } = require("../utils/categories");
const { getCurrentStock } = require("../utils/inventory");

const router = express.Router();

router.use(protect);

function buildFilter(query) {
  const filter = {};

  if (query.productName) {
    filter.productName = new RegExp(String(query.productName).trim(), "i");
  }

  if (query.category) {
    filter.category = String(query.category).trim();
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

  return filter;
}

router.get("/", asyncHandler(async (req, res) => {
  const filter = buildFilter(req.query);

  if (req.user.role === "clerk") {
    filter.enteredBy = req.user._id;
  }

  const records = await StockRecord.find(filter)
    .populate("enteredBy", "name email role")
    .sort({ date: -1, createdAt: -1 });

  res.json({ records });
}));

router.get("/products", asyncHandler(async (_req, res) => {
  const products = await Product.find().sort({ name: 1 }).select("name");
  res.json({ products: products.map((p) => p.name) });
}));

router.get("/summary", requireRole("cfo"), asyncHandler(async (req, res) => {
  const filter = buildFilter(req.query);
  const records = await StockRecord.find(filter).sort({ date: 1 });
  res.json(summarizeRecords(records));
}));

router.post("/", requireRole("clerk"), asyncHandler(async (req, res) => {
  const data = normalizeRecordInput(req.body);

  if (!data.productName) {
    return res.status(400).json({ message: "Product is required" });
  }

  if (!(await isValidProductName(data.productName))) {
    return res.status(400).json({
      message: "Select a product from the catalog. Ask the CFO to upload the product list if it is missing.",
    });
  }

  if (!data.category) {
    return res.status(400).json({ message: "Category is required." });
  }

  if (!(await isValidCategory(data.category))) {
    return res.status(400).json({
      message: "Select a valid category. Ask the CFO to add categories first.",
    });
  }

  const openingBalance = await getCurrentStock(data.productName, data.category);
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

  const populated = await record.populate("enteredBy", "name email role");
  res.status(201).json({ record: populated });
}));

router.put("/:id", requireRole("clerk"), asyncHandler(async (req, res) => {
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

  if (!(await isValidProductName(data.productName))) {
    return res.status(400).json({
      message: "Select a product from the catalog. Ask the CFO to upload the product list if it is missing.",
    });
  }

  if (!data.category) {
    return res.status(400).json({ message: "Category is required." });
  }

  if (!(await isValidCategory(data.category))) {
    return res.status(400).json({
      message: "Select a valid category. Ask the CFO to add categories first.",
    });
  }

  const openingBalance = await getCurrentStock(
    data.productName,
    data.category,
    existing._id
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
  const populated = await existing.populate("enteredBy", "name email role");
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
