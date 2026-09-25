const express = require("express");
const multer = require("multer");
const ExcelJS = require("exceljs");
const Product = require("../models/Product");
const CatalogConfig = require("../models/CatalogConfig");
const StockRecord = require("../models/StockRecord");
const RecordChange = require("../models/RecordChange");
const { protect, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");
const {
  COMPANIES,
  COMPANY_LABELS,
  ACCESSIBLE_LOCATIONS,
  TRIFONE_CATALOG_FIELDS,
  ELECTRONICS_CATALOG_FIELDS,
  PRESS_CATALOG_FIELDS,
  emptyAccessibleStock,
  normalizeTrifoneData,
  normalizeElectronicsData,
  normalizePressData,
  isLocationlessCompany,
  isTrifoneCompany,
  isPressCompany,
} = require("../constants/companies");
const {
  parseCatalogNamesExcel,
  parseAccessibleCatalogExcel,
  parseTrifoneCatalogExcel,
  parseElectronicsCatalogExcel,
  parsePressCatalogExcel,
  namesToCatalogRows,
  getCurrentStock,
  buildStockSnapshot,
  buildMovementMap,
  liveAccessibleStock,
  liveLocationBalance,
  liveTrifoneBalance,
  liveLocationlessBalance,
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

function resolveCompany(value) {
  const company = String(value || COMPANIES.ACCESSIBLE).trim().toLowerCase();
  if (!Object.values(COMPANIES).includes(company)) {
    return null;
  }
  return company;
}

async function getHiddenColumns(company) {
  const config = await CatalogConfig.findOne({ company }).select("hiddenColumns");
  return config?.hiddenColumns || [];
}

function visibleAccessibleLocations(hiddenColumns = []) {
  return ACCESSIBLE_LOCATIONS.filter((loc) => !hiddenColumns.includes(loc));
}

function visibleTrifoneFields() {
  return TRIFONE_CATALOG_FIELDS;
}

function visibleElectronicsFields() {
  return ELECTRONICS_CATALOG_FIELDS;
}

function visiblePressFields() {
  return PRESS_CATALOG_FIELDS;
}

function formatAccessibleProduct(row, visibleLocations = ACCESSIBLE_LOCATIONS) {
  const stock = row.stock?.toObject?.() || row.stock || emptyAccessibleStock();
  const allTotal = visibleLocations.reduce(
    (sum, loc) => sum + (Number(stock[loc]) || 0),
    0
  );

  return {
    _id: row._id,
    name: row.name,
    company: row.company,
    salePrice: Number(row.salePrice) || 0,
    stock,
    allTotal,
  };
}

function formatTrifoneProduct(row, movementMap = null) {
  const trifoneData = normalizeTrifoneData(row.trifoneData);
  if (movementMap) {
    const net = movementMap.get(row.name) || 0;
    trifoneData.closingStock = Math.max(0, trifoneData.openingStock + net);
  }

  return {
    _id: row._id,
    name: row.name,
    company: row.company,
    trifoneData,
  };
}

function formatElectronicsProduct(row, movementMap = null) {
  const electronicsData = normalizeElectronicsData(row.electronicsData);
  if (movementMap) {
    const net = movementMap.get(row.name) || 0;
    electronicsData.closingStock = Math.max(0, electronicsData.openingStock + net);
  }

  return {
    _id: row._id,
    name: row.name,
    company: row.company,
    electronicsData,
    openingStock: electronicsData.openingStock,
    closingStock: electronicsData.closingStock,
  };
}

function formatPressProduct(row, movementMap = null) {
  const pressData = normalizePressData(row.pressData);
  if (movementMap) {
    const net = movementMap.get(row.name) || 0;
    pressData.closingStock = Math.max(0, pressData.openingStock + net);
  }

  return {
    _id: row._id,
    name: row.name,
    company: row.company,
    pressData,
    openingStock: pressData.openingStock,
    closingStock: pressData.closingStock,
  };
}

function formatProduct(row, { live = false, movementMap = null, visibleLocations = ACCESSIBLE_LOCATIONS } = {}) {
  if (row.company === COMPANIES.TRIFONE) {
    const product = formatTrifoneProduct(row, live && movementMap ? movementMap : null);
    if (live && movementMap) product.live = true;
    return product;
  }

  if (row.company === COMPANIES.ELECTRONICS) {
    const product = formatElectronicsProduct(row, live && movementMap ? movementMap : null);
    if (live && movementMap) product.live = true;
    return product;
  }

  if (row.company === COMPANIES.PRESS) {
    const product = formatPressProduct(row, live && movementMap ? movementMap : null);
    if (live && movementMap) product.live = true;
    return product;
  }

  const product = formatAccessibleProduct(row, visibleLocations);
  if (live && movementMap) {
    const { stock } = liveAccessibleStock(row, movementMap);
    product.stock = stock;
    product.allTotal = visibleLocations.reduce(
      (sum, loc) => sum + (Number(stock[loc]) || 0),
      0
    );
    product.live = true;
  }
  return product;
}

function resolveStaffAssignment(user) {
  if (isLocationlessCompany(user.assignedCompany)) {
    return { company: user.assignedCompany, location: null };
  }
  if (user.location) {
    return { company: COMPANIES.ACCESSIBLE, location: user.location };
  }
  return null;
}

function catalogOpeningFromRow(row) {
  if (row.company === COMPANIES.ELECTRONICS) {
    return normalizeElectronicsData(row.electronicsData).openingStock;
  }
  if (row.company === COMPANIES.TRIFONE) {
    return normalizeTrifoneData(row.trifoneData).openingStock;
  }
  if (row.company === COMPANIES.PRESS) {
    return normalizePressData(row.pressData).openingStock;
  }
  return 0;
}

router.get("/my-inventory", requireRole("clerk", "accountant", "trifone", "press"), asyncHandler(async (req, res) => {
  let company;
  let location;

  if (req.user.role === "accountant") {
    company = resolveCompany(req.query.company);
    if (!company) {
      return res.status(400).json({ message: "Company is required." });
    }
    if (company === COMPANIES.ACCESSIBLE) {
      location = req.query.location
        ? String(req.query.location).trim().toUpperCase()
        : null;
      if (!location || !ACCESSIBLE_LOCATIONS.includes(location)) {
        return res.status(400).json({ message: "APL location is required." });
      }
    } else {
      location = null;
    }
  } else if (req.user.role === "trifone") {
    company = resolveCompany(req.query.company);
    if (!company || !isTrifoneCompany(company)) {
      return res.status(400).json({
        message: "Company must be Trifone Gadgets or Trifone Electronics.",
      });
    }
    location = null;
  } else if (req.user.role === "press") {
    company = COMPANIES.PRESS;
    location = null;
  } else {
    const assignment = resolveStaffAssignment(req.user);
    if (!assignment) {
      return res.status(403).json({
        message: "You have not been assigned yet. Contact CFO.",
      });
    }
    company = assignment.company;
    location = assignment.location;
  }

  const search = String(req.query.search || "").trim();
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));

  const filter = { company };
  if (search) {
    filter.name = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  }

  const [total, rows, movementMap] = await Promise.all([
    Product.countDocuments(filter),
    Product.find(filter)
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select("name company stock salePrice trifoneData electronicsData pressData")
      .lean(),
    buildMovementMap(company, location),
  ]);

  const products = rows.map((row) => {
    if (isLocationlessCompany(company)) {
      return {
        _id: row._id,
        name: row.name,
        company: row.company,
        openingBalance: catalogOpeningFromRow(row),
        balance: liveLocationlessBalance(row, movementMap),
      };
    }

    const stockObj = row.stock?.toObject?.() || row.stock || emptyAccessibleStock();
    return {
      _id: row._id,
      name: row.name,
      company: row.company,
      location,
      openingBalance: Number(stockObj[location]) || 0,
      balance: liveLocationBalance(row, location, movementMap),
    };
  });

  res.json({
    products,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    company,
    location,
  });
}));

router.get("/", asyncHandler(async (req, res) => {
  const search = String(req.query.search || "").trim();
  const company = req.query.company
    ? resolveCompany(req.query.company)
    : null;
  const page = Number(req.query.page);
  const limit = Number(req.query.limit);
  const live = String(req.query.live || "") === "1" || req.query.live === "true";

  const filter = {};
  if (company) filter.company = company;
  if (search) {
    filter.name = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
  }

  if (page > 0 && limit > 0) {
    const safeLimit = Math.min(100, Math.max(1, limit));
    const safePage = Math.max(1, page);
    const [total, rows, movementMap, hiddenColumns] = await Promise.all([
      Product.countDocuments(filter),
      Product.find(filter)
        .sort({ name: 1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .select("name company stock salePrice trifoneData electronicsData pressData")
        .lean(),
      live && company ? buildMovementMap(company) : null,
      company ? getHiddenColumns(company) : [],
    ]);
    const locations =
      company === COMPANIES.ACCESSIBLE ? visibleAccessibleLocations(hiddenColumns) : [];
    const trifoneFields =
      company === COMPANIES.TRIFONE ? visibleTrifoneFields() : [];
    const electronicsFields =
      company === COMPANIES.ELECTRONICS ? visibleElectronicsFields() : [];
    const pressFields =
      company === COMPANIES.PRESS ? visiblePressFields() : [];

    return res.json({
      products: rows.map((row) =>
        formatProduct(row, { live, movementMap, visibleLocations: locations.length ? locations : ACCESSIBLE_LOCATIONS })
      ),
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      company: company || null,
      live,
      locations,
      trifoneFields,
      electronicsFields,
      pressFields,
      hiddenColumns,
    });
  }

  const products = await Product.find(filter)
    .sort({ name: 1 })
    .select("name company");
  res.json({
    products: products.map((p) => ({ name: p.name, company: p.company })),
  });
}));

router.get("/stock", requireRole("cfo", "md"), asyncHandler(async (_req, res) => {
  res.json(await buildStockSnapshot());
}));

router.get("/stock-level", asyncHandler(async (req, res) => {
  const productName = String(req.query.productName || "").trim();
  const company = String(req.query.company || "").trim().toLowerCase();
  const excludeRecordId = req.query.excludeRecordId || null;
  const location = req.query.location
    ? String(req.query.location).trim().toUpperCase()
    : req.user?.location || null;

  if (!productName || !company) {
    return res.status(400).json({ message: "Product and company are required." });
  }

  if (location && !ACCESSIBLE_LOCATIONS.includes(location)) {
    return res.status(400).json({ message: "Invalid location." });
  }

  const openingBalance = await getCurrentStock(
    productName,
    company,
    excludeRecordId,
    location
  );
  res.json({ openingBalance });
}));

router.get("/template", requireRole("cfo", "md"), asyncHandler(async (req, res) => {
  const company = resolveCompany(req.query.company);
  if (!company) {
    return res.status(400).json({ message: "Invalid company." });
  }

  const workbook = new ExcelJS.Workbook();
  const label = COMPANY_LABELS[company].replace(/\s+/g, "-").toLowerCase();

  const nameHeader =
    company === COMPANIES.TRIFONE
      ? "ITEM NAME"
      : company === COMPANIES.ELECTRONICS
        ? "Item Name"
        : company === COMPANIES.PRESS
          ? "MATERIALS ITEM"
          : "BookName";

  const sheet = workbook.addWorksheet("Catalog");
  if (company === COMPANIES.ACCESSIBLE) {
    sheet.columns = [
      { header: nameHeader, key: "name", width: 42 },
      { header: "Sale Price", key: "salePrice", width: 14 },
      { header: "Opening Stock", key: "opening", width: 16 },
      { header: "Closing Stock", key: "closing", width: 16 },
    ];
    sheet.addRow({ name: "Example product 1", salePrice: 2500, opening: 100, closing: 85 });
    sheet.addRow({ name: "Example product 2", salePrice: 1800, opening: 50, closing: 40 });
    sheet.addRow({ name: "Example product 3", salePrice: 0, opening: 0, closing: 0 });
  } else if (company === COMPANIES.TRIFONE) {
    sheet.columns = [
      { header: nameHeader, key: "name", width: 42 },
      { header: "Cost Price", key: "costPrice", width: 14 },
      { header: "Opening Stock", key: "opening", width: 16 },
      { header: "Closing Stock", key: "closing", width: 16 },
    ];
    sheet.addRow({ name: "Example product 1", costPrice: 45000, opening: 100, closing: 85 });
    sheet.addRow({ name: "Example product 2", costPrice: 28000, opening: 50, closing: 40 });
    sheet.addRow({ name: "Example product 3", costPrice: 0, opening: 0, closing: 0 });
  } else if (company === COMPANIES.PRESS) {
    sheet.columns = [
      { header: nameHeader, key: "name", width: 42 },
      { header: "QTY USED", key: "qtyUsed", width: 14 },
      { header: "Opening Stock", key: "opening", width: 16 },
      { header: "Closing Stock", key: "closing", width: 16 },
    ];
    sheet.addRow({ name: "Example material 1", qtyUsed: 500, opening: 500, closing: 500 });
    sheet.addRow({ name: "Example material 2", qtyUsed: 25, opening: 25, closing: 25 });
    sheet.addRow({ name: "Example material 3", qtyUsed: 0, opening: 0, closing: 0 });
  } else if (company === COMPANIES.ELECTRONICS) {
    sheet.columns = [
      { header: "Item Code", key: "itemCode", width: 18 },
      { header: "Item name", key: "name", width: 28 },
      { header: "Cost Price (N)", key: "costPrice", width: 18 },
    ];
    sheet.addRow({ itemCode: "TB / 15E", name: "BLENDER", costPrice: 13000 });
    sheet.addRow({ itemCode: "1F / 16A", name: "SOLAR FAN", costPrice: 44000 });
    sheet.addRow({ itemCode: "10LTR DIGITAL", name: "AIR FRYER", costPrice: 40000 });
  } else {
    sheet.columns = [
      { header: nameHeader, key: "name", width: 42 },
      { header: "Opening Stock", key: "opening", width: 16 },
      { header: "Closing Stock", key: "closing", width: 16 },
    ];
    sheet.addRow({ name: "Example product 1", opening: 100, closing: 85 });
    sheet.addRow({ name: "Example product 2", opening: 50, closing: 40 });
    sheet.addRow({ name: "Example product 3", opening: 0, closing: 0 });
  }

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${label}-catalog-template.xlsx"`
  );
  await workbook.xlsx.write(res);
  res.end();
}));

function resolveUploadMode(value) {
  const mode = String(value || "update").trim().toLowerCase();
  return mode === "replace" ? "replace" : "update";
}

function catalogSetFields(company, row) {
  if (company === COMPANIES.TRIFONE) return { trifoneData: row.trifoneData };
  if (company === COMPANIES.ELECTRONICS) return { electronicsData: row.electronicsData };
  if (company === COMPANIES.PRESS) return { pressData: row.pressData };
  return {
    stock: row.stock,
    salePrice: Number(row.salePrice) || 0,
  };
}

async function importCatalogRows(company, rows, userId, mode) {
  const label = COMPANY_LABELS[company];
  const existingBefore = await Product.countDocuments({ company });

  if (mode === "replace") {
    await Product.deleteMany({ company });
    await CatalogConfig.findOneAndUpdate(
      { company },
      { hiddenColumns: [] },
      { upsert: true }
    );

    await Product.insertMany(
      rows.map((row) => ({
        name: row.name,
        company,
        uploadedBy: userId,
        ...catalogSetFields(company, row),
      }))
    );

    const total = await Product.countDocuments({ company });
    return {
      message: `${rows.length} product(s) imported for ${label}. Previous ${label} catalog entries were replaced.`,
      mode,
      imported: rows.length,
      added: rows.length,
      updated: 0,
      kept: 0,
      removed: existingBefore,
      total,
      count: total,
      company,
    };
  }

  const bulkOps = rows.map((row) => ({
    updateOne: {
      filter: { company, name: row.name },
      update: {
        $set: {
          company,
          name: row.name,
          uploadedBy: userId,
          ...catalogSetFields(company, row),
        },
      },
      upsert: true,
    },
  }));

  const bulkResult = await Product.bulkWrite(bulkOps, { ordered: false });
  const added = bulkResult.upsertedCount || 0;
  const updated = bulkResult.modifiedCount || 0;
  const matchedExisting = Math.max(0, (bulkResult.matchedCount || 0) - updated);
  const kept = Math.max(0, existingBefore - (bulkResult.matchedCount || 0));
  const total = await Product.countDocuments({ company });

  const parts = [];
  if (added) parts.push(`${added} new`);
  if (updated) parts.push(`${updated} updated`);
  if (matchedExisting) parts.push(`${matchedExisting} unchanged in file`);
  if (kept) parts.push(`${kept} kept from previous catalog`);

  return {
    message: `Catalog updated for ${label}: ${parts.join(", ")}. Total products: ${total}.`,
    mode,
    imported: rows.length,
    added,
    updated,
    unchanged: matchedExisting,
    kept,
    removed: 0,
    total,
    count: total,
    company,
  };
}

router.post(
  "/reset",
  requireRole("cfo"),
  asyncHandler(async (req, res) => {
    const company = resolveCompany(req.body.company || req.query.company);
    if (!company) {
      return res.status(400).json({ message: "Invalid company." });
    }

    const label = COMPANY_LABELS[company];

    const recordIds = await StockRecord.find({ company }).distinct("_id");
    const deletedRecords = await StockRecord.deleteMany({ company });
    if (recordIds.length) {
      await RecordChange.deleteMany({ recordId: { $in: recordIds } });
    }

    let productUpdate;
    if (company === COMPANIES.ACCESSIBLE) {
      productUpdate = { $set: { stock: emptyAccessibleStock() } };
    } else if (company === COMPANIES.TRIFONE) {
      productUpdate = {
        $set: {
          "trifoneData.openingStock": 0,
          "trifoneData.closingStock": 0,
          "trifoneData.currentStock": 0,
        },
      };
    } else if (company === COMPANIES.ELECTRONICS) {
      productUpdate = {
        $set: {
          "electronicsData.openingStock": 0,
          "electronicsData.closingStock": 0,
          "electronicsData.currentStock": 0,
        },
      };
    } else if (company === COMPANIES.PRESS) {
      productUpdate = {
        $set: {
          "pressData.openingStock": 0,
          "pressData.closingStock": 0,
        },
      };
    } else {
      return res.status(400).json({ message: "Invalid company." });
    }

    const productsResult = await Product.updateMany({ company }, productUpdate);

    res.json({
      message: `Reset ${label}: all in/out movements cleared and stock balances set to zero. Product names were kept.`,
      company,
      recordsDeleted: deletedRecords.deletedCount || 0,
      productsReset: productsResult.modifiedCount || 0,
    });
  })
);

router.post(
  "/upload",
  requireRole("cfo"),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        message: "Upload an Excel file (.xlsx) for the selected company catalog.",
      });
    }

    const company = resolveCompany(req.body.company || req.query.company);
    if (!company) {
      return res.status(400).json({ message: "Invalid company." });
    }

    const mode = resolveUploadMode(req.body.mode || req.query.mode);

    let rows;
    if (company === COMPANIES.ACCESSIBLE) {
      rows = await parseAccessibleCatalogExcel(req.file.buffer);
    } else if (company === COMPANIES.TRIFONE) {
      rows = await parseTrifoneCatalogExcel(req.file.buffer);
    } else if (company === COMPANIES.PRESS) {
      rows = await parsePressCatalogExcel(req.file.buffer);
    } else if (company === COMPANIES.ELECTRONICS) {
      rows = await parseElectronicsCatalogExcel(req.file.buffer);
    } else {
      const names = await parseCatalogNamesExcel(req.file.buffer, company);
      rows = namesToCatalogRows(names, company);
    }

    if (!rows.length) {
      return res.status(400).json({
        message:
          company === COMPANIES.TRIFONE
            ? "No product names found. Use a column headed ITEM NAME or Item Name. Optionally include a Cost Price column."
            : company === COMPANIES.ELECTRONICS
              ? "No products found. Use columns Item Code, Item name, and Cost Price. In and out start at zero."
            : company === COMPANIES.PRESS
              ? "No product names found. Use a column headed MATERIALS ITEM. Optionally include QTY USED, Opening Stock, or Closing Stock."
            : "No product names found. Use a column headed BookName or Item Name. Optionally include a Sale Price column.",
      });
    }

    res.json(await importCatalogRows(company, rows, req.user._id, mode));
  })
);

router.delete(
  "/column/:key",
  requireRole("cfo"),
  asyncHandler(async (req, res) => {
    const company = resolveCompany(req.query.company);
    const columnKey = String(req.params.key || "").trim();

    if (!company) {
      return res.status(400).json({ message: "Invalid company." });
    }

    const hiddenColumns = await getHiddenColumns(company);

    if (company === COMPANIES.TRIFONE || company === COMPANIES.ELECTRONICS || company === COMPANIES.PRESS) {
      return res.status(400).json({
        message: "Opening Stock and Closing Stock columns cannot be removed.",
      });
    }

    const location = columnKey.toUpperCase();
    if (!ACCESSIBLE_LOCATIONS.includes(location)) {
      return res.status(400).json({ message: "Invalid column." });
    }
    if (hiddenColumns.includes(location)) {
      return res.status(400).json({ message: "Column is already removed." });
    }
    const remaining = visibleAccessibleLocations(hiddenColumns);
    if (remaining.length <= 1) {
      return res.status(400).json({ message: "At least one location column must remain." });
    }

    await CatalogConfig.findOneAndUpdate(
      { company },
      { $addToSet: { hiddenColumns: location } },
      { upsert: true, new: true }
    );
    await Product.updateMany(
      { company },
      { $unset: { [`stock.${location}`]: "" } }
    );

    res.json({
      message: `Column "${location}" removed from the APL catalog.`,
      column: location,
      company,
    });
  })
);

router.delete(
  "/:id",
  requireRole("cfo"),
  asyncHandler(async (req, res) => {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found." });
    }

    await product.deleteOne();

    res.json({
      message: `"${product.name}" removed from the catalog.`,
      id: product._id,
    });
  })
);

module.exports = router;
