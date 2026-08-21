const express = require("express");
const multer = require("multer");
const ExcelJS = require("exceljs");
const Product = require("../models/Product");
const CatalogConfig = require("../models/CatalogConfig");
const { protect, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");
const {
  COMPANIES,
  COMPANY_LABELS,
  ACCESSIBLE_LOCATIONS,
  TRIFONE_AUGUST_FIELDS,
  ELECTRONICS_FIELDS,
  emptyAccessibleStock,
  emptyTrifoneData,
  emptyElectronicsData,
  isLocationlessCompany,
  isTrifoneCompany,
} = require("../constants/companies");
const {
  parseAccessibleInventoryExcel,
  parseTrifoneInventoryExcel,
  parseElectronicsInventoryExcel,
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

function visibleTrifoneFields(hiddenColumns = []) {
  return TRIFONE_AUGUST_FIELDS.filter((field) => !hiddenColumns.includes(field.key));
}

function visibleElectronicsFields(hiddenColumns = []) {
  return ELECTRONICS_FIELDS.filter((field) => !hiddenColumns.includes(field.key));
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
    stock,
    allTotal,
  };
}

function formatTrifoneProduct(row) {
  const trifoneData =
    row.trifoneData?.toObject?.() || row.trifoneData || emptyTrifoneData();

  return {
    _id: row._id,
    name: row.name,
    company: row.company,
    trifoneData,
  };
}

function formatElectronicsProduct(row) {
  const electronicsData =
    row.electronicsData?.toObject?.() || row.electronicsData || emptyElectronicsData();

  return {
    _id: row._id,
    name: row.name,
    company: row.company,
    electronicsData,
    currentStock: Number(electronicsData.currentStock) || 0,
  };
}

function formatProduct(row, { live = false, movementMap = null, visibleLocations = ACCESSIBLE_LOCATIONS } = {}) {
  if (row.company === COMPANIES.TRIFONE) {
    const product = formatTrifoneProduct(row);
    if (live && movementMap) {
      product.trifoneData = {
        ...product.trifoneData,
        currentStock: liveTrifoneBalance(row, movementMap),
      };
      product.live = true;
    }
    return product;
  }

  if (row.company === COMPANIES.ELECTRONICS) {
    const product = formatElectronicsProduct(row);
    if (live && movementMap) {
      const currentStock = liveLocationlessBalance(row, movementMap);
      product.electronicsData = {
        ...product.electronicsData,
        currentStock,
      };
      product.currentStock = currentStock;
      product.live = true;
    }
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
    const data =
      row.electronicsData?.toObject?.() || row.electronicsData || emptyElectronicsData();
    return Number(data.currentStock) || 0;
  }
  const trifoneData = row.trifoneData?.toObject?.() || row.trifoneData || emptyTrifoneData();
  return Number(trifoneData.currentStock) || 0;
}

router.get("/my-inventory", requireRole("clerk", "accountant", "trifone"), asyncHandler(async (req, res) => {
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

  const total = await Product.countDocuments(filter);
  const rows = await Product.find(filter)
    .sort({ name: 1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .select("name company stock trifoneData electronicsData");

  const movementMap = await buildMovementMap(company, location);

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
    const total = await Product.countDocuments(filter);
    const rows = await Product.find(filter)
      .sort({ name: 1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .select("name company stock trifoneData electronicsData");

    let movementMap = null;
    if (live && company) {
      movementMap = await buildMovementMap(company);
    }

    const hiddenColumns = company ? await getHiddenColumns(company) : [];
    const locations =
      company === COMPANIES.ACCESSIBLE ? visibleAccessibleLocations(hiddenColumns) : [];
    const trifoneFields =
      company === COMPANIES.TRIFONE ? visibleTrifoneFields(hiddenColumns) : [];
    const electronicsFields =
      company === COMPANIES.ELECTRONICS ? visibleElectronicsFields(hiddenColumns) : [];

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

router.get("/stock", requireRole("cfo"), asyncHandler(async (_req, res) => {
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

router.get("/template", requireRole("cfo"), asyncHandler(async (req, res) => {
  const company = resolveCompany(req.query.company);
  if (!company) {
    return res.status(400).json({ message: "Invalid company." });
  }

  const workbook = new ExcelJS.Workbook();
  const label = COMPANY_LABELS[company].replace(/\s+/g, "-").toLowerCase();

  if (company === COMPANIES.TRIFONE) {
    const sheet = workbook.addWorksheet("Stock Register");
    sheet.columns = [
      { header: "ITEM NAME", key: "name", width: 24 },
      ...TRIFONE_AUGUST_FIELDS.map((field) => ({
        header: field.label,
        key: field.key,
        width: field.type === "text" ? 18 : 16,
      })),
    ];
    sheet.addRow({
      name: "X801 MAX",
      openingStock2Aug: 5,
      openingStock9Aug: 5,
      openingStock16Aug: 5,
      restock2Aug: 0,
      currentStock: 5,
      unitsInMaint: 3,
      unitsInMaint3Aug: 3,
      totalMaint: 3,
      returns: 0,
      maintenanceValue: 165000,
      returnValue: 0,
      unitsSold: 1150,
      costPrice: 45000,
      unitPrice: 55000,
      salesRevenue: 63250000,
      stockValueOnHand: 275000,
      remarks: "",
    });
    sheet.addRow({
      name: "Q72",
      openingStock2Aug: 0,
      openingStock9Aug: 0,
      openingStock16Aug: 0,
      restock2Aug: 0,
      currentStock: 0,
      unitsInMaint: 0,
      unitsInMaint3Aug: 0,
      totalMaint: 0,
      returns: 0,
      maintenanceValue: 0,
      returnValue: 0,
      unitsSold: 0,
      costPrice: 0,
      unitPrice: 0,
      salesRevenue: 0,
      stockValueOnHand: 0,
      remarks: "Out of Stock",
    });
  } else if (company === COMPANIES.ELECTRONICS) {
    const sheet = workbook.addWorksheet("Inventory Movement");
    sheet.getRow(1).values = [
      undefined,
      "S/N",
      "DATE",
      "DETAILS",
      "JUICE EXTRACTOR",
      "DIGITAL 10L AIR FRYER",
      "MANUAL 10L AIR FRYER",
      "TB 15E BLENDER",
      "HOT PLATE",
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(2).values = [
      undefined,
      1,
      "14/02/2026",
      "OPENING INVENTORY",
      160,
      100,
      80,
      400,
      120,
    ];
    sheet.getRow(3).values = [
      undefined,
      2,
      "31/07/2026",
      "CLOSING BALANCE AS AT JULY",
      0,
      64,
      178,
      476,
      148,
    ];
    sheet.columns = [
      { width: 8 },
      { width: 14 },
      { width: 32 },
      { width: 18 },
      { width: 22 },
      { width: 22 },
      { width: 16 },
      { width: 12 },
    ];
  } else {
    const sheet = workbook.addWorksheet("Inventory");
    sheet.columns = [
      { header: "BookName", key: "name", width: 42 },
      ...ACCESSIBLE_LOCATIONS.map((loc) => ({
        header: loc,
        key: loc,
        width: 10,
      })),
    ];
    sheet.addRow({
      name: "30 MINUTES ON THE ASSEMBLY",
      HO: 319,
      AK: 54,
      AB: 183,
      ED: 52,
      LA: 81,
      KA: 31,
      US: 102,
      AN: 33,
      ANX: 32,
    });
    sheet.addRow({
      name: "A JOLLY RIDE TO GRANDPA",
      HO: 0,
      AK: 12,
      AB: 0,
      ED: 8,
      LA: 0,
      KA: 0,
      US: 0,
      AN: 0,
      ANX: 0,
    });
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
  return { stock: row.stock };
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

    let rows = [];
    if (company === COMPANIES.TRIFONE) {
      rows = await parseTrifoneInventoryExcel(req.file.buffer);
    } else if (company === COMPANIES.ELECTRONICS) {
      rows = await parseElectronicsInventoryExcel(req.file.buffer);
    } else {
      rows = await parseAccessibleInventoryExcel(req.file.buffer);
    }

    if (!rows.length) {
      return res.status(400).json({
        message:
          company === COMPANIES.TRIFONE
            ? "No Trifone Gadgets products found. Use the stock register with ITEM NAME and August columns."
            : company === COMPANIES.ELECTRONICS
              ? "No Trifone Electronics products found. Use the Inventory Movement sheet with product names across the top and a CLOSING BALANCE AS AT JULY row."
            : "No products found. Use BookName plus location columns HO, AK, AB, ED, LA, KA, US, AN, ANX.",
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

    if (company === COMPANIES.TRIFONE) {
      const field = TRIFONE_AUGUST_FIELDS.find((item) => item.key === columnKey);
      if (!field) {
        return res.status(400).json({ message: "Invalid column." });
      }
      if (hiddenColumns.includes(columnKey)) {
        return res.status(400).json({ message: "Column is already removed." });
      }
      const remaining = visibleTrifoneFields(hiddenColumns);
      if (remaining.length <= 1) {
        return res.status(400).json({ message: "At least one data column must remain." });
      }

      await CatalogConfig.findOneAndUpdate(
        { company },
        { $addToSet: { hiddenColumns: columnKey } },
        { upsert: true, new: true }
      );
      await Product.updateMany(
        { company },
        { $unset: { [`trifoneData.${columnKey}`]: "" } }
      );

      return res.json({
        message: `Column "${field.label}" removed from the Trifone Gadgets catalog.`,
        column: columnKey,
        company,
      });
    }

    if (company === COMPANIES.ELECTRONICS) {
      return res.status(400).json({
        message: "The Current Stock column cannot be removed from the Trifone Electronics catalog.",
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
