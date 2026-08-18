const express = require("express");
const multer = require("multer");
const ExcelJS = require("exceljs");
const Product = require("../models/Product");
const { protect, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");
const {
  parseProductNamesExcel,
  getCurrentStock,
  buildStockSnapshot,
} = require("../utils/inventory");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
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

function formatProduct(row) {
  return {
    _id: row._id,
    name: row.name,
  };
}

router.get("/", asyncHandler(async (req, res) => {
  const search = String(req.query.search || "").trim();
  const page = Number(req.query.page);
  const limit = Number(req.query.limit);

  const filter = search
    ? { name: new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }
    : {};

  if (page > 0 && limit > 0) {
    const safeLimit = Math.min(100, Math.max(1, limit));
    const safePage = Math.max(1, page);
    const total = await Product.countDocuments(filter);
    const rows = await Product.find(filter)
      .sort({ name: 1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .select("name");

    return res.json({
      products: rows.map(formatProduct),
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
    });
  }

  const products = await Product.find(filter).sort({ name: 1 }).select("name");
  res.json({
    products: products.map((p) => p.name),
  });
}));

router.get("/stock", requireRole("cfo"), asyncHandler(async (_req, res) => {
  res.json(await buildStockSnapshot());
}));

router.get("/stock-level", asyncHandler(async (req, res) => {
  const productName = String(req.query.productName || "").trim();
  const category = String(req.query.category || "").trim();
  const excludeRecordId = req.query.excludeRecordId || null;

  if (!productName || !category) {
    return res.status(400).json({ message: "Product and category are required." });
  }

  const openingBalance = await getCurrentStock(
    productName,
    category,
    excludeRecordId
  );
  res.json({ openingBalance });
}));

router.get("/template", requireRole("cfo"), asyncHandler(async (_req, res) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Products");
  sheet.columns = [{ header: "Item Name", key: "name", width: 40 }];
  sheet.addRow({ name: "30 MINUTES ON THE ASSEMBLY" });
  sheet.addRow({ name: "A JOLLY RIDE TO GRANDPA" });

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="product-list-template.xlsx"'
  );
  await workbook.xlsx.write(res);
  res.end();
}));

router.post(
  "/upload",
  requireRole("cfo"),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        message: "Upload an Excel file (.xlsx) with product names in the first column.",
      });
    }

    const names = await parseProductNamesExcel(req.file.buffer);

    if (!names.length) {
      return res.status(400).json({
        message: "No product names found. Use a column headed Item Name, BookName, or Product Name.",
      });
    }

    const result = await Product.bulkWrite(
      names.map((name) => ({
        updateOne: {
          filter: { name },
          update: {
            $setOnInsert: { name, uploadedBy: req.user._id },
          },
          upsert: true,
        },
      }))
    );

    const added = result.upsertedCount;
    const skipped = names.length - added;
    const total = await Product.countDocuments();

    res.json({
      message: `${added} new product(s) added. ${skipped} already in catalog. ${total} total products.`,
      added,
      skipped,
      total,
      count: total,
    });
  })
);

module.exports = router;
