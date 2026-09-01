const ExcelJS = require("exceljs");
const Product = require("../models/Product");
const StockRecord = require("../models/StockRecord");
const { COMPANIES, isLocationlessCompany } = require("../constants/companies");
const { DEFAULT_TRANSACTION_REMARK } = require("../constants/transactionRemarks");
const { computeClosingBalance } = require("./stock");
const { buildMovementMap } = require("./inventory");
const { nextStockIds } = require("./stockId");

const TITLE_HEADERS = [
  /^title\s*name$/i,
  /^book\s*name$/i,
  /^item\s*name$/i,
  /^product(\s*name)?$/i,
  /^name$/i,
];

const OP_BAL_HEADERS = [/^op\s*bal$/i, /^opbal$/i, /^opening\s*bal(ance)?$/i];
const REC_QTY_HEADERS = [
  /^rec\s*qty$/i,
  /^recqty$/i,
  /^received(\s*qty(antity)?)?$/i,
  /^receipt(s)?$/i,
];
const ISSUE_QTY_HEADERS = [
  /^issue\s*qty$/i,
  /^issueqty$/i,
  /^issued(\s*qty(antity)?)?$/i,
  /^issue(s)?$/i,
];
const CL_BAL_HEADERS = [/^cl\s*bal$/i, /^clbal$/i, /^closing\s*bal(ance)?$/i];

function cellText(value) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if (Array.isArray(value)) return value.map(cellText).join("").trim();
    if (value.hyperlink && value.text) return String(value.text).trim();
    if (value.text) return String(value.text).trim();
    if (value.result != null) return String(value.result).trim();
    if (value.richText) {
      return value.richText.map((part) => part.text || "").join("").trim();
    }
  }
  return String(value).trim();
}

function parseCount(value) {
  const text = cellText(value);
  if (!text || text === "-") return 0;
  const n = Number(text.replace(/,/g, ""));
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

function normalizeHeader(value) {
  return cellText(value)
    .replace(/\uFEFF/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function headerMatches(header, patterns) {
  const normalized = normalizeHeader(header);
  if (!normalized) return false;
  return patterns.some((pattern) => pattern.test(normalized));
}

function findColumn(headers, patterns, maxCol = 40) {
  for (let col = 1; col <= maxCol; col += 1) {
    const header = headers[col];
    if (!header) continue;
    if (headerMatches(header, patterns)) {
      return col;
    }
  }
  return -1;
}

function readRowHeaders(sheet, rowNumber, maxCol = 40) {
  const headers = [];
  const row = sheet.getRow(rowNumber);
  for (let col = 1; col <= maxCol; col += 1) {
    headers[col] = normalizeHeader(row.getCell(col).value);
  }
  return headers;
}

function findMovementHeaderRow(sheet) {
  for (let rowNumber = 1; rowNumber <= 100; rowNumber += 1) {
    const headers = readRowHeaders(sheet, rowNumber);
    const titleCol = findColumn(headers, TITLE_HEADERS);
    const opBalCol = findColumn(headers, OP_BAL_HEADERS);
    const recQtyCol = findColumn(headers, REC_QTY_HEADERS);
    const issueQtyCol = findColumn(headers, ISSUE_QTY_HEADERS);
    const clBalCol = findColumn(headers, CL_BAL_HEADERS);

    if (titleCol >= 1 && opBalCol >= 1 && recQtyCol >= 1 && issueQtyCol >= 1 && clBalCol >= 1) {
      return { rowNumber, headers, titleCol, opBalCol, recQtyCol, issueQtyCol, clBalCol };
    }
  }
  return null;
}

function pickMovementSheet(workbook) {
  const byName = workbook.worksheets.find(
    (ws) => String(ws.name || "").trim().toLowerCase() === "data"
  );
  if (byName && findMovementHeaderRow(byName)) return byName;

  for (const ws of workbook.worksheets) {
    if (findMovementHeaderRow(ws)) return ws;
  }

  return workbook.worksheets[0] || null;
}

function describeScannedHeaders(sheet) {
  const samples = [];
  for (let rowNumber = 1; rowNumber <= 20; rowNumber += 1) {
    const headers = readRowHeaders(sheet, rowNumber);
    const cells = headers.filter(Boolean);
    if (cells.length) {
      samples.push(`row ${rowNumber}: ${cells.slice(0, 8).join(" | ")}`);
    }
  }
  return samples.length ? samples.join("; ") : "no header-like rows found";
}

async function parseMovementExcel(buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch (err) {
    throw new Error(
      "Could not read the Excel file. Save it as .xlsx in WPS/Excel and try again."
    );
  }

  const sheet = pickMovementSheet(workbook);
  if (!sheet) {
    throw new Error("The Excel file has no worksheets.");
  }

  const header = findMovementHeaderRow(sheet);
  if (!header) {
    throw new Error(
      `Could not find a header row with Title Name, OpBal, RecQty, IssueQty, and ClBal on sheet "${sheet.name}". Scanned: ${describeScannedHeaders(sheet)}`
    );
  }

  const {
    rowNumber: headerRowNumber,
    titleCol,
    opBalCol,
    recQtyCol,
    issueQtyCol,
    clBalCol,
  } = header;

  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;

    const titleName = cellText(row.getCell(titleCol).value);
    if (!titleName) return;

    rows.push({
      rowNumber,
      titleName,
      opBal: parseCount(row.getCell(opBalCol).value),
      recQty: parseCount(row.getCell(recQtyCol).value),
      issueQty: parseCount(row.getCell(issueQtyCol).value),
      clBal: parseCount(row.getCell(clBalCol).value),
    });
  });

  if (!rows.length) {
    throw new Error("No product rows found in the Excel file.");
  }

  return rows;
}

async function buildProductLookup(company) {
  const products = await Product.find({ company }).select(
    "name stock trifoneData electronicsData company"
  );
  const lookup = new Map();
  const byName = new Map();
  for (const product of products) {
    lookup.set(product.name.trim().toLowerCase(), product.name);
    byName.set(product.name, product);
  }
  return { lookup, byName };
}

function catalogBaseStock(product, location) {
  if (location && product.company === COMPANIES.ACCESSIBLE) {
    const stock = product.stock?.toObject?.() || product.stock || {};
    return Number(stock[location]) || 0;
  }
  if (product.company === COMPANIES.ELECTRONICS) {
    return Number(product.electronicsData?.currentStock) || 0;
  }
  if (product.company === COMPANIES.TRIFONE) {
    return Number(product.trifoneData?.currentStock) || 0;
  }
  return 0;
}

function applyCatalogDelta(product, location, delta) {
  if (location && product.company === COMPANIES.ACCESSIBLE) {
    const stock = product.stock?.toObject?.() || product.stock || {};
    stock[location] = Math.max(0, (Number(stock[location]) || 0) + delta);
    product.stock = stock;
    return;
  }
  if (product.company === COMPANIES.TRIFONE) {
    product.trifoneData = product.trifoneData || {};
    product.trifoneData.currentStock = Math.max(
      0,
      (Number(product.trifoneData.currentStock) || 0) + delta
    );
    return;
  }
  if (product.company === COMPANIES.ELECTRONICS) {
    product.electronicsData = product.electronicsData || {};
    product.electronicsData.currentStock = Math.max(
      0,
      (Number(product.electronicsData.currentStock) || 0) + delta
    );
  }
}

async function importMovementRows(rows, options) {
  const { company, location, date, enteredBy, remark = DEFAULT_TRANSACTION_REMARK } = options;
  const { lookup, byName } = await buildProductLookup(company);
  const movementMap = await buildMovementMap(company, location);

  const results = {
    imported: 0,
    skipped: 0,
    reconciled: 0,
    errors: [],
  };

  const pendingRecords = [];
  const catalogUpdates = new Map();

  for (const row of rows) {
    const productName = lookup.get(row.titleName.trim().toLowerCase());
    if (!productName) {
      results.skipped += 1;
      results.errors.push({
        row: row.rowNumber,
        productName: row.titleName,
        message: "Product not found in catalog.",
      });
      continue;
    }

    const expectedClosing = row.opBal + row.recQty - row.issueQty;
    if (row.clBal !== expectedClosing) {
      results.skipped += 1;
      results.errors.push({
        row: row.rowNumber,
        productName,
        message: `Closing balance mismatch: ClBal is ${row.clBal} but OpBal + RecQty − IssueQty = ${expectedClosing}.`,
      });
      continue;
    }

    if (row.clBal < 0) {
      results.skipped += 1;
      results.errors.push({
        row: row.rowNumber,
        productName,
        message: "Closing balance cannot be negative.",
      });
      continue;
    }

    const product = byName.get(productName);
    const catalogDelta = catalogUpdates.get(productName) || 0;
    const movementNet = movementMap.get(productName) || 0;
    const currentStock = Math.max(
      0,
      catalogBaseStock(product, location) + catalogDelta + movementNet
    );

    if (row.recQty === 0 && row.issueQty === 0 && row.opBal === currentStock) {
      results.skipped += 1;
      continue;
    }

    let openingBalance = currentStock;
    if (row.opBal !== currentStock) {
      const delta = row.opBal - currentStock;
      catalogUpdates.set(productName, catalogDelta + delta);
      openingBalance = row.opBal;
      results.reconciled += 1;
    }

    pendingRecords.push({
      productName,
      company,
      location: isLocationlessCompany(company) ? null : location,
      date,
      openingBalance,
      inbound: row.recQty,
      outbound: row.issueQty,
      stockReceived: 0,
      stockOut: 0,
      remark,
      closingBalance: computeClosingBalance({
        openingBalance,
        inbound: row.recQty,
        outbound: row.issueQty,
        stockReceived: 0,
        stockOut: 0,
      }),
      enteredBy,
    });
  }

  if (catalogUpdates.size) {
    const bulkOps = [];
    for (const [productName, delta] of catalogUpdates) {
      const product = byName.get(productName);
      if (!product || delta === 0) continue;
      applyCatalogDelta(product, location, delta);
      if (location && product.company === COMPANIES.ACCESSIBLE) {
        bulkOps.push({
          updateOne: {
            filter: { _id: product._id },
            update: { $set: { [`stock.${location}`]: product.stock[location] } },
          },
        });
      } else if (product.company === COMPANIES.TRIFONE) {
        bulkOps.push({
          updateOne: {
            filter: { _id: product._id },
            update: { $set: { "trifoneData.currentStock": product.trifoneData.currentStock } },
          },
        });
      } else if (product.company === COMPANIES.ELECTRONICS) {
        bulkOps.push({
          updateOne: {
            filter: { _id: product._id },
            update: {
              $set: { "electronicsData.currentStock": product.electronicsData.currentStock },
            },
          },
        });
      }
    }
    if (bulkOps.length) {
      await Product.bulkWrite(bulkOps);
    }
  }

  if (pendingRecords.length) {
    const stockIds = await nextStockIds(pendingRecords.length);
    const docs = pendingRecords.map((record, index) => ({
      ...record,
      stockId: stockIds[index],
    }));
    await StockRecord.insertMany(docs, { ordered: false });
    results.imported = docs.length;
  }

  return results;
}

module.exports = {
  parseMovementExcel,
  importMovementRows,
};
