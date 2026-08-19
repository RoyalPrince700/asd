const express = require("express");
const ExcelJS = require("exceljs");
const {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  HeadingLevel,
  WidthType,
  AlignmentType,
} = require("docx");
const StockRecord = require("../models/StockRecord");
const { protect, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");
const { summarizeRecords } = require("../utils/stock");
const { companyLabel } = require("../constants/companies");
const { applyStockIdFilter } = require("../utils/stockId");

const router = express.Router();

router.use(protect, requireRole("cfo"));

function enteredByLabel(user) {
  if (!user?.name) return "";
  if (user.role === "accountant") return `${user.name} (Accountant)`;
  return user.name;
}

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

function formatDate(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });
}

function stamp() {
  return new Date().toISOString().slice(0, 10);
}

async function loadReportData(query) {
  const records = await StockRecord.find(buildFilter(query))
    .populate("enteredBy", "name email role")
    .sort({ date: -1, createdAt: -1 });
  return { records, summary: summarizeRecords(records) };
}

router.get("/excel", asyncHandler(async (req, res) => {
  const { records, summary } = await loadReportData(req.query);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Accessible Stock Dashboard";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Stock Movement");
  sheet.columns = [
    { header: "Stock ID", key: "stockId", width: 14 },
    { header: "Date", key: "date", width: 14 },
    { header: "Company", key: "company", width: 14 },
    { header: "Product", key: "productName", width: 28 },
    { header: "Opening Balance", key: "openingBalance", width: 18 },
    { header: "In", key: "inbound", width: 12 },
    { header: "Out", key: "outbound", width: 12 },
    { header: "Stock Received", key: "stockReceived", width: 18 },
    { header: "Stock Out", key: "stockOut", width: 14 },
    { header: "Closing Balance", key: "closingBalance", width: 18 },
    { header: "Entered By", key: "enteredBy", width: 22 },
  ];

  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF132337" },
  };

  for (const row of records) {
    sheet.addRow({
      stockId: row.stockId || "",
      date: formatDate(row.date),
      company: companyLabel(row.company, { short: true }),
      productName: row.productName,
      openingBalance: row.openingBalance,
      inbound: row.inbound,
      outbound: row.outbound,
      stockReceived: row.stockReceived,
      stockOut: row.stockOut,
      closingBalance: row.closingBalance,
      enteredBy: enteredByLabel(row.enteredBy),
    });
  }

  const totalsRow = sheet.addRow({
    date: "",
    productName: "TOTALS",
    openingBalance: summary.totals.openingBalance,
    inbound: summary.totals.inbound,
    outbound: summary.totals.outbound,
    stockReceived: summary.totals.stockReceived,
    stockOut: summary.totals.stockOut,
    closingBalance: summary.totals.closingBalance,
    enteredBy: `${summary.totals.recordCount} records`,
  });
  totalsRow.font = { bold: true };

  const productSheet = workbook.addWorksheet("By Product");
  productSheet.columns = [
    { header: "Product", key: "productName", width: 28 },
    { header: "Records", key: "recordCount", width: 12 },
    { header: "Opening", key: "openingBalance", width: 14 },
    { header: "In", key: "inbound", width: 12 },
    { header: "Out", key: "outbound", width: 12 },
    { header: "Stock Received", key: "stockReceived", width: 18 },
    { header: "Stock Out", key: "stockOut", width: 14 },
    { header: "Closing", key: "closingBalance", width: 14 },
  ];
  productSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  productSheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF132337" },
  };
  summary.byProduct.forEach((row) => productSheet.addRow(row));

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="cfo-stock-report-${stamp()}.xlsx"`
  );
  await workbook.xlsx.write(res);
  res.end();
}));

function cell(text, opts = {}) {
  return new TableCell({
    width: { size: opts.width || 1200, type: WidthType.DXA },
    shading: opts.shading ? { fill: opts.shading } : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [
      new Paragraph({
        alignment: opts.align || AlignmentType.LEFT,
        children: [
          new TextRun({
            text: String(text ?? ""),
            bold: Boolean(opts.bold),
            color: opts.color || "1C1917",
            size: 18,
            font: "Calibri",
          }),
        ],
      }),
    ],
  });
}

router.get("/docx", asyncHandler(async (req, res) => {
  const { records, summary } = await loadReportData(req.query);
  const t = summary.totals;

  const header = new TableRow({
    children: [
      "Stock ID",
      "Date",
      "Company",
      "Product",
      "Opening",
      "In",
      "Out",
      "Received",
      "Stock Out",
      "Closing",
    ].map((label) =>
      cell(label, { bold: true, color: "FFFFFF", shading: "132337", width: 1400 })
    ),
  });

  const bodyRows = records.slice(0, 80).map(
    (row) =>
      new TableRow({
        children: [
          cell(row.stockId || "—"),
          cell(formatDate(row.date)),
          cell(companyLabel(row.company, { short: true })),
          cell(row.productName),
          cell(formatNumber(row.openingBalance), { align: AlignmentType.RIGHT }),
          cell(formatNumber(row.inbound), { align: AlignmentType.RIGHT }),
          cell(formatNumber(row.outbound), { align: AlignmentType.RIGHT }),
          cell(formatNumber(row.stockReceived), { align: AlignmentType.RIGHT }),
          cell(formatNumber(row.stockOut), { align: AlignmentType.RIGHT }),
          cell(formatNumber(row.closingBalance), { align: AlignmentType.RIGHT }),
        ],
      })
  );

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [
              new TextRun({
                text: "CFO Stock Movement Report",
                font: "Calibri",
                bold: true,
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: `Generated ${new Date().toLocaleString()} · ${t.recordCount} records`,
                italics: true,
                size: 20,
                color: "57534E",
              }),
            ],
          }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: "Executive summary", bold: true })],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Opening ${formatNumber(t.openingBalance)}  ·  In ${formatNumber(t.inbound)}  ·  Out ${formatNumber(t.outbound)}  ·  Stock received ${formatNumber(t.stockReceived)}  ·  Stock out ${formatNumber(t.stockOut)}  ·  Closing ${formatNumber(t.closingBalance)}  ·  Net movement ${formatNumber(t.netMovement)}`,
                size: 22,
              }),
            ],
            spacing: { after: 280 },
          }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: "Line items", bold: true })],
          }),
          new Table({
            width: { size: 10080, type: WidthType.DXA },
            rows: [header, ...bodyRows],
          }),
          records.length > 80
            ? new Paragraph({
                spacing: { before: 200 },
                children: [
                  new TextRun({
                    text: `Showing first 80 of ${records.length} records. Export Excel for the full listing.`,
                    italics: true,
                  }),
                ],
              })
            : new Paragraph({ text: "" }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="cfo-stock-report-${stamp()}.docx"`
  );
  res.send(buffer);
}));

router.get("/ledger/excel", asyncHandler(async (req, res) => {
  const { records, summary } = await loadReportData(req.query);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Accessible Stock Dashboard";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Ledger Lines");
  sheet.columns = [
    { header: "Stock ID", key: "stockId", width: 14 },
    { header: "Date", key: "date", width: 14 },
    { header: "Company", key: "company", width: 14 },
    { header: "Location", key: "location", width: 12 },
    { header: "Product", key: "productName", width: 28 },
    { header: "Opening", key: "openingBalance", width: 14 },
    { header: "In", key: "inbound", width: 12 },
    { header: "Out", key: "outbound", width: 12 },
    { header: "Closing", key: "closingBalance", width: 14 },
    { header: "Posted by", key: "enteredBy", width: 22 },
  ];

  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF132337" },
  };

  for (const row of records) {
    sheet.addRow({
      stockId: row.stockId || "",
      date: formatDate(row.date),
      company: companyLabel(row.company, { short: true }),
      location: row.location || "",
      productName: row.productName,
      openingBalance: row.openingBalance,
      inbound: row.inbound,
      outbound: row.outbound,
      closingBalance: row.closingBalance,
      enteredBy: enteredByLabel(row.enteredBy),
    });
  }

  const totalsRow = sheet.addRow({
    date: "",
    productName: "TOTALS",
    openingBalance: summary.totals.openingBalance,
    inbound: summary.totals.inbound,
    outbound: summary.totals.outbound,
    closingBalance: summary.totals.closingBalance,
    enteredBy: `${summary.totals.recordCount} records`,
  });
  totalsRow.font = { bold: true };

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="cfo-ledger-lines-${stamp()}.xlsx"`
  );
  await workbook.xlsx.write(res);
  res.end();
}));

router.get("/ledger/docx", asyncHandler(async (req, res) => {
  const { records, summary } = await loadReportData(req.query);
  const t = summary.totals;

  const header = new TableRow({
    children: [
      "Stock ID",
      "Date",
      "Company",
      "Location",
      "Product",
      "Opening",
      "In",
      "Out",
      "Closing",
      "Clerk",
    ].map((label) =>
      cell(label, { bold: true, color: "FFFFFF", shading: "132337", width: 1200 })
    ),
  });

  const bodyRows = records.map(
    (row) =>
      new TableRow({
        children: [
          cell(row.stockId || "—"),
          cell(formatDate(row.date)),
          cell(companyLabel(row.company, { short: true })),
          cell(row.location || "—"),
          cell(row.productName),
          cell(formatNumber(row.openingBalance), { align: AlignmentType.RIGHT }),
          cell(formatNumber(row.inbound), { align: AlignmentType.RIGHT }),
          cell(formatNumber(row.outbound), { align: AlignmentType.RIGHT }),
          cell(formatNumber(row.closingBalance), { align: AlignmentType.RIGHT }),
          cell(enteredByLabel(row.enteredBy) || "—"),
        ],
      })
  );

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [
              new TextRun({
                text: "Ledger Lines Report",
                font: "Calibri",
                bold: true,
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: `Generated ${new Date().toLocaleString()} · ${t.recordCount} records · Opening ${formatNumber(t.openingBalance)} · In ${formatNumber(t.inbound)} · Out ${formatNumber(t.outbound)} · Closing ${formatNumber(t.closingBalance)}`,
                italics: true,
                size: 20,
                color: "57534E",
              }),
            ],
          }),
          new Table({
            width: { size: 10080, type: WidthType.DXA },
            rows: [header, ...bodyRows],
          }),
        ],
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="cfo-ledger-lines-${stamp()}.docx"`
  );
  res.send(buffer);
}));

module.exports = router;
