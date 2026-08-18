const ExcelJS = require("exceljs");
const StockRecord = require("../models/StockRecord");
const Product = require("../models/Product");

const NAME_HEADERS = [
  /^item\s*name$/i,
  /^book\s*name$/i,
  /^product(\s*name)?$/i,
  /^name$/i,
];

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

async function getCurrentStock(productName, category, excludeRecordId = null) {
  const match = { productName, category };
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

  return Math.max(0, movement?.net || 0);
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
  getCurrentStock,
  buildStockSnapshot,
};
