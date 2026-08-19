const ExcelJS = require("exceljs");
const StockRecord = require("../models/StockRecord");
const Product = require("../models/Product");
const {
  COMPANIES,
  ACCESSIBLE_LOCATIONS,
  SKIP_HEADERS,
  TRIFONE_HEADER_PATTERNS,
  TRIFONE_FIELD_LOOKUP,
  emptyAccessibleStock,
  emptyTrifoneData,
  emptyElectronicsData,
  isLocationlessCompany,
} = require("../constants/companies");

const NAME_HEADERS = [
  /^item\s*name$/i,
  /^book\s*name$/i,
  /^product(\s*name)?$/i,
  /^name$/i,
];

const LOCATION_LOOKUP = Object.fromEntries(
  ACCESSIBLE_LOCATIONS.map((loc) => [loc.toUpperCase(), loc])
);

function cellText(value) {
  if (value == null) return "";
  if (typeof value === "object") {
    if (value.text) return String(value.text).trim();
    if (value.result != null) return String(value.result).trim();
    if (value.richText) {
      return value.richText.map((part) => part.text || "").join("").trim();
    }
  }
  return String(value).trim();
}

function isNameHeader(text) {
  return NAME_HEADERS.some((pattern) => pattern.test(text));
}

function findNameColumn(headers) {
  for (const pattern of NAME_HEADERS) {
    const col = headers.findIndex((h) => h && pattern.test(h));
    if (col >= 1) return col;
  }
  return 1;
}

async function parseProductNamesExcel(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error("The Excel file has no worksheets.");
  }

  const headerRow = sheet.getRow(1);
  const headers = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = cellText(cell.value);
  });

  let nameCol = findNameColumn(headers);

  const names = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      const header = cellText(row.getCell(nameCol).value);
      if (isNameHeader(header)) return;
    }

    const name = cellText(row.getCell(nameCol).value);
    if (!name) return;
    if (rowNumber === 1 && isNameHeader(name)) return;
    names.push(name);
  });

  return [...new Set(names)];
}

function parseCount(value) {
  const text = cellText(value);
  if (!text || text === "-") return 0;
  const n = Number(text.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function isLocationHeader(text) {
  return Boolean(LOCATION_LOOKUP[String(text).trim().toUpperCase()]);
}

function normalizeLocationHeader(text) {
  return LOCATION_LOOKUP[String(text).trim().toUpperCase()] || null;
}

async function parseAccessibleInventoryExcel(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error("The Excel file has no worksheets.");
  }

  const headerRow = sheet.getRow(1);
  const headers = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = cellText(cell.value);
  });

  const nameCol = findNameColumn(headers);
  if (!nameCol) {
    throw new Error("No BookName column found. Use a column headed BookName or Item Name.");
  }

  const locationCols = [];
  headers.forEach((header, colNumber) => {
    if (!header || colNumber === nameCol) return;
    if (SKIP_HEADERS.test(header)) return;
    const location = normalizeLocationHeader(header);
    if (location) {
      locationCols.push({ colNumber, location });
    }
  });

  if (!locationCols.length) {
    throw new Error(
      "No location columns found. Expected headers: HO, AK, AB, ED, LA, KA, US, AN, ANX."
    );
  }

  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const name = cellText(row.getCell(nameCol).value);
    if (!name) return;

    const stock = emptyAccessibleStock();
    for (const { colNumber, location } of locationCols) {
      stock[location] = parseCount(row.getCell(colNumber).value);
    }

    rows.push({ name, stock });
  });

  return rows;
}

function normalizeHeader(text) {
  return cellText(text)
    .replace(/[₦#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function headerMonth(header) {
  const match = header.match(/\(\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})\s*\)/);
  if (!match) return null;
  return parseInt(match[2], 10);
}

function shouldSkipTrifoneHeader(header) {
  const month = headerMonth(header);
  if (month == null) return false;
  return month !== 8;
}

function matchTrifoneField(header) {
  const normalized = normalizeHeader(header);
  if (!normalized || shouldSkipTrifoneHeader(normalized)) return null;

  for (const { key, patterns } of TRIFONE_HEADER_PATTERNS) {
    if (patterns.some((pattern) => pattern.test(normalized))) {
      return key;
    }
  }
  return null;
}

function findTrifoneHeaderRow(sheet) {
  for (let rowNumber = 1; rowNumber <= 20; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    let hasItemName = false;
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (/item\s*name/i.test(normalizeHeader(cell.value))) {
        hasItemName = true;
      }
    });
    if (hasItemName) return rowNumber;
  }
  return null;
}

function parseMoney(value) {
  const text = cellText(value).replace(/[₦#,]/g, "").trim();
  if (!text || text === "-") return 0;
  const n = Number(text);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function parseTrifoneValue(value, fieldKey) {
  if (fieldKey === "remarks") return cellText(value);
  const field = TRIFONE_FIELD_LOOKUP[fieldKey];
  if (field?.type === "money") return parseMoney(value);
  return parseCount(value);
}

function isTrifoneDataRow(name) {
  const text = cellText(name);
  if (!text) return false;
  if (/^total$/i.test(text)) return false;
  if (/key\s*performance/i.test(text)) return false;
  if (/^reporting\s*period$/i.test(text)) return false;
  return true;
}

async function parseTrifoneInventoryExcel(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error("The Excel file has no worksheets.");
  }

  const headerRowNumber = findTrifoneHeaderRow(sheet);
  if (!headerRowNumber) {
    throw new Error('No "ITEM NAME" header row found in the Trifone Gadgets register.');
  }

  const headerRow = sheet.getRow(headerRowNumber);
  const headers = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = normalizeHeader(cell.value);
  });

  const nameCol = headers.findIndex(
    (header) => header && /^item\s*name$/i.test(header)
  );
  if (nameCol < 1) {
    throw new Error('No "ITEM NAME" column found.');
  }

  const fieldCols = [];
  headers.forEach((header, colNumber) => {
    if (!header || colNumber === nameCol) return;
    const fieldKey = matchTrifoneField(header);
    if (fieldKey) {
      fieldCols.push({ colNumber, fieldKey });
    }
  });

  if (!fieldCols.length) {
    throw new Error(
      "No August columns found. Expected August dated columns and current stock fields."
    );
  }

  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;

    const name = cellText(row.getCell(nameCol).value);
    if (!isTrifoneDataRow(name)) return;

    const trifoneData = emptyTrifoneData();
    for (const { colNumber, fieldKey } of fieldCols) {
      trifoneData[fieldKey] = parseTrifoneValue(
        row.getCell(colNumber).value,
        fieldKey
      );
    }

    rows.push({ name, trifoneData });
  });

  return rows;
}

const ELECTRONICS_META_HEADERS =
  /^(s\/?n|s\.?\s*n\.?|serial(\s*(no\.?|number)?)?|date|details|particulars|description|#)$/i;
const ELECTRONICS_TITLE_SKIP =
  /best\s*technology|inventory\s*movement|^goods$|company\s*name/i;
const ELECTRONICS_CLOSING = /closing\s*balance/i;

function isElectronicsMetaLabel(text) {
  return ELECTRONICS_META_HEADERS.test(String(text || "").trim());
}

function looksLikeElectronicsProductName(text) {
  const value = cellText(text);
  if (!value) return false;
  if (isElectronicsMetaLabel(value)) return false;
  if (ELECTRONICS_TITLE_SKIP.test(value)) return false;
  if (/^opening\s*inventory$/i.test(value)) return false;
  if (ELECTRONICS_CLOSING.test(value)) return false;
  if (!/[a-z]/i.test(value)) return false;
  if (/^\d{1,2}[\/\-]\d{1,2}([\/\-]\d{2,4})?$/.test(value)) return false;
  return true;
}

function parseAccountingCount(value) {
  if (value == null || value === "") return 0;
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value) : 0;
  }
  if (typeof value === "object") {
    if (value.result != null) return parseAccountingCount(value.result);
    if (typeof value.text === "string") return parseAccountingCount(value.text);
  }

  const text = cellText(value);
  if (!text || text === "-") return 0;
  const trimmed = text.trim();
  const negative = /^\(.*\)$/.test(trimmed);
  const n = Number(trimmed.replace(/[(),]/g, "").replace(/,/g, "").trim());
  if (!Number.isFinite(n)) return 0;
  return Math.round(negative ? -Math.abs(n) : n);
}

function parseElectronicsStock(value) {
  return Math.max(0, parseAccountingCount(value));
}

function electronicsCellHasValue(value) {
  if (value == null || value === "") return false;
  if (typeof value === "number") return Number.isFinite(value);
  const text = cellText(value);
  if (!text || text === "-") return false;
  return true;
}

function findElectronicsSheet(workbook) {
  return (
    workbook.worksheets.find((sheet) => /inventory\s*movement/i.test(sheet.name)) ||
    workbook.worksheets.find((sheet) => /inventory/i.test(sheet.name)) ||
    workbook.worksheets[0]
  );
}

function collectRowTexts(row) {
  const texts = [];
  row.eachCell({ includeEmpty: false }, (cell) => {
    const text = cellText(cell.value);
    if (text) texts.push(text);
  });
  return texts;
}

function findElectronicsProductHeader(sheet) {
  const maxScan = Math.min(Math.max(sheet.rowCount || 1, 1), 40);
  let best = null;

  for (let rowNumber = 1; rowNumber <= maxScan; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const productCols = [];
    let metaHits = 0;

    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const text = cellText(cell.value);
      if (!text) return;
      if (isElectronicsMetaLabel(text)) {
        metaHits += 1;
        return;
      }
      if (looksLikeElectronicsProductName(text)) {
        productCols.push({ colNumber, name: text.replace(/\s+/g, " ").trim() });
      }
    });

    if (productCols.length < 2) continue;

    const score = productCols.length * 10 + metaHits * 8;
    if (!best || score > best.score) {
      best = { rowNumber, productCols, score };
    }
  }

  if (!best) {
    throw new Error(
      "No product name row found. Put product names across the top (Juice Extractor, Digital 10L Air Fryer, etc.)."
    );
  }

  return best;
}

function findElectronicsClosingRow(sheet, headerRowNumber, productCols) {
  const lastRow = sheet.actualRowCount || sheet.rowCount || sheet.lastRow?.number || 1;
  let lastNumericRow = null;
  let closingJuly = null;
  let closingAny = null;

  for (let rowNumber = lastRow; rowNumber > headerRowNumber; rowNumber -= 1) {
    const row = sheet.getRow(rowNumber);
    const rowText = collectRowTexts(row).join(" ");
    const hasProductValues = productCols.some(({ colNumber }) =>
      electronicsCellHasValue(row.getCell(colNumber).value)
    );

    if (!hasProductValues && !ELECTRONICS_CLOSING.test(rowText)) continue;

    if (ELECTRONICS_CLOSING.test(rowText) && /july/i.test(rowText)) {
      closingJuly = rowNumber;
      break;
    }
    if (ELECTRONICS_CLOSING.test(rowText) && !closingAny) {
      closingAny = rowNumber;
    }
    if (hasProductValues && !lastNumericRow) {
      lastNumericRow = rowNumber;
    }
  }

  const rowNumber = closingJuly || closingAny || lastNumericRow;
  if (!rowNumber) {
    throw new Error(
      'No closing balance row found. The last row should be "CLOSING BALANCE AS AT JULY".'
    );
  }

  return rowNumber;
}

async function parseElectronicsInventoryExcel(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const sheet = findElectronicsSheet(workbook);
  if (!sheet) {
    throw new Error("The Excel file has no worksheets.");
  }

  const { rowNumber: headerRowNumber, productCols } = findElectronicsProductHeader(sheet);
  const closingRowNumber = findElectronicsClosingRow(sheet, headerRowNumber, productCols);
  const closingRow = sheet.getRow(closingRowNumber);

  const seen = new Set();
  const rows = [];

  for (const { colNumber, name } of productCols) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    rows.push({
      name,
      electronicsData: {
        currentStock: parseElectronicsStock(closingRow.getCell(colNumber).value),
      },
    });
  }

  if (!rows.length) {
    throw new Error("No Trifone Electronics products found in the Inventory Movement sheet.");
  }

  return rows;
}

async function buildMovementMap(company, location = null) {
  const match = { company };
  if (location) {
    match.location = location;
  } else if (isLocationlessCompany(company)) {
    match.$or = [{ location: null }, { location: { $exists: false } }];
  }

  const groupId =
    location || isLocationlessCompany(company)
      ? "$productName"
      : { productName: "$productName", location: "$location" };

  const rows = await StockRecord.aggregate([
    { $match: match },
    {
      $group: {
        _id: groupId,
        net: {
          $sum: {
            $subtract: [
              { $add: ["$inbound", "$stockReceived"] },
              { $add: ["$outbound", "$stockOut"] },
            ],
          },
        },
      },
    },
  ]);

  const map = new Map();
  for (const row of rows) {
    if (location) {
      map.set(row._id, row.net);
    } else if (isLocationlessCompany(company)) {
      map.set(row._id, row.net);
    } else {
      const loc = row._id.location || "";
      map.set(`${row._id.productName}:${loc}`, row.net);
    }
  }
  return map;
}

function liveAccessibleStock(product, movementMap) {
  const stockObj = product.stock?.toObject?.() || product.stock || emptyAccessibleStock();
  const liveStock = {};
  let allTotal = 0;

  for (const loc of ACCESSIBLE_LOCATIONS) {
    const base = Number(stockObj[loc]) || 0;
    const net = movementMap.get(`${product.name}:${loc}`) || 0;
    liveStock[loc] = Math.max(0, base + net);
    allTotal += liveStock[loc];
  }

  return { stock: liveStock, allTotal };
}

function liveLocationBalance(product, location, movementMap) {
  const stockObj = product.stock?.toObject?.() || product.stock || emptyAccessibleStock();
  const base = Number(stockObj[location]) || 0;
  const net = movementMap.get(product.name) || 0;
  return Math.max(0, base + net);
}

function catalogBaseStock(product) {
  if (product.company === COMPANIES.ELECTRONICS) {
    const data =
      product.electronicsData?.toObject?.() ||
      product.electronicsData ||
      emptyElectronicsData();
    return Number(data.currentStock) || 0;
  }

  if (product.company === COMPANIES.TRIFONE) {
    const trifoneObj =
      product.trifoneData?.toObject?.() || product.trifoneData || emptyTrifoneData();
    return Number(trifoneObj.currentStock) || 0;
  }

  return 0;
}

function liveLocationlessBalance(product, movementMap) {
  const base = catalogBaseStock(product);
  const net = movementMap.get(product.name) || 0;
  return Math.max(0, base + net);
}

function liveTrifoneBalance(product, movementMap) {
  return liveLocationlessBalance(product, movementMap);
}

async function getCurrentStock(productName, company, excludeRecordId = null, location = null) {
  const match = { productName, company };
  if (location) {
    match.location = location;
  } else if (isLocationlessCompany(company)) {
    match.$or = [{ location: null }, { location: { $exists: false } }];
  }
  if (excludeRecordId) {
    match._id = { $ne: excludeRecordId };
  }

  const [movement] = await StockRecord.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        net: {
          $sum: {
            $subtract: [
              { $add: ["$inbound", "$stockReceived"] },
              { $add: ["$outbound", "$stockOut"] },
            ],
          },
        },
      },
    },
  ]);

  let baseStock = 0;
  const product = await Product.findOne({ name: productName, company }).select(
    "stock trifoneData electronicsData company"
  );

  if (location && product?.stock) {
    const stockObj = product.stock.toObject?.() || product.stock;
    baseStock = Number(stockObj[location]) || 0;
  } else if (isLocationlessCompany(company) && product) {
    baseStock = catalogBaseStock(product);
  }

  return Math.max(0, baseStock + (movement?.net || 0));
}

async function buildStockSnapshot() {
  const products = await Product.find().sort({ name: 1 });
  const rows = await Promise.all(
    products.map(async (product) => ({
      _id: product._id,
      name: product.name,
      quantity: await getCurrentStock(product.name),
    }))
  );

  const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0);
  return { rows, totalQuantity };
}

module.exports = {
  parseProductNamesExcel,
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
};
