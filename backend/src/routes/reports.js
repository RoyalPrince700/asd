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
const {
  companyLabel,
  COMPANIES,
  isValidCompany,
  isLocationlessCompany,
  isTrifoneCompany,
  ACCESSIBLE_LOCATIONS,
} = require("../constants/companies");
const { cfoTransactionRemarkExport } = require("../constants/transactionRemarks");
const { applyStockIdFilter } = require("../utils/stockId");
const { pendingChangeMapForRecords } = require("../utils/recordChanges");

const router = express.Router();

const TRANSACTION_REPORT_ROLES = [
  "clerk",
  "accountant",
  "trifone",
  "press",
  "press_manager",
];

router.get(
  "/transactions/:type",
  protect,
  requireRole(...TRANSACTION_REPORT_ROLES),
  asyncHandler(async (req, res) => {
    const type = String(req.params.type || "").toLowerCase();
    if (type !== "excel" && type !== "docx") {
      return res.status(404).json({ message: "Unknown report format." });
    }

    const bounds = monthBounds(req.query.month);
    if (!bounds) {
      return res.status(400).json({ message: "Choose a month to download." });
    }

    const scoped = scopeTransactionReport(req.user, req.query);
    if (scoped.error) {
      return res.status(400).json({ message: scoped.error });
    }

    const filter = {
      ...scoped.filter,
      date: { $gte: bounds.from, $lte: bounds.to },
    };

    const records = await StockRecord.find(filter)
      .populate("enteredBy", "name email role")
      .sort({ date: -1, createdAt: -1 })
      .lean();
    const pendingMap = await pendingChangeMapForRecords(records.map((row) => row._id));
    const summary = summarizeRecords(records);
    const scope = reportScopeLabel(req.user, filter);
    const title = `Transaction report · ${monthTitle(bounds.label)}`;
    const filename = `transactions-${bounds.label}`;

    if (type === "excel") {
      await sendTransactionExcel(res, { records, summary, pendingMap, title, scope, filename });
      return;
    }

    await sendTransactionDocx(res, { records, summary, pendingMap, title, scope, filename });
  })
);

router.use(protect, requireRole("cfo", "md"));

function enteredByLabel(user) {
  if (!user?.name) return "";
  if (user.role === "accountant") return `${user.name} (Accountant)`;
  if (user.role === "trifone") return `${user.name} (Trifone)`;
  if (user.role === "press") return `${user.name} (Press)`;
  if (user.role === "press_manager") return `${user.name} (Press manager)`;
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

function monthBounds(month) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(month || "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  const mon = Number(match[2]);
  const from = new Date(`${match[1]}-${match[2]}-01`);
  const lastDay = new Date(year, mon, 0).getDate();
  const to = new Date(`${match[1]}-${match[2]}-${String(lastDay).padStart(2, "0")}`);
  to.setHours(23, 59, 59, 999);
  return { from, to, label: `${match[1]}-${match[2]}` };
}

function monthTitle(label) {
  const [year, mon] = label.split("-");
  return new Date(Number(year), Number(mon) - 1, 1).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function scopeTransactionReport(user, query) {
  const filter = {};

  if (user.role === "clerk") {
    if (!isLocationlessCompany(user.assignedCompany) && !user.location) {
      return { error: "Your account is not assigned yet." };
    }
    filter.enteredBy = user._id;
    if (isLocationlessCompany(user.assignedCompany)) {
      filter.company = user.assignedCompany;
    } else {
      filter.company = COMPANIES.ACCESSIBLE;
      filter.location = user.location;
    }
    return { filter };
  }

  if (user.role === "press") {
    filter.enteredBy = user._id;
    filter.company = COMPANIES.PRESS;
    return { filter };
  }

  if (user.role === "press_manager") {
    filter.company = COMPANIES.PRESS;
    return { filter };
  }

  if (user.role === "trifone") {
    const company = String(query.company || "").trim().toLowerCase();
    if (!isTrifoneCompany(company)) {
      return { error: "Select Trifone Gadgets or Trifone Electronics." };
    }
    filter.company = company;
    return { filter };
  }

  if (user.role === "accountant") {
    const company = String(query.company || "").trim().toLowerCase();
    if (!isValidCompany(company)) {
      return { error: "Select a company." };
    }
    filter.company = company;
    if (!isLocationlessCompany(company)) {
      const location = String(query.location || "").trim().toUpperCase();
      if (!ACCESSIBLE_LOCATIONS.includes(location)) {
        return { error: "Select an APL location." };
      }
      filter.location = location;
    }
    return { filter };
  }

  return { error: "Access denied for this role." };
}

function reportScopeLabel(user, filter) {
  if (user.role === "press") return "Your Press transactions";
  if (user.role === "press_manager") return "All Press transactions";
  const company = companyLabel(filter.company, { short: true });
  return filter.location ? `${company} · ${filter.location}` : company;
}

function statusLabel(pending) {
  return pending ? "Awaiting CFO" : "Approved";
}

function styleHeaderRow(row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF132337" },
  };
}

async function sendTransactionExcel(res, { records, summary, pendingMap, title, scope, filename }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Accessible Stock Dashboard";
  workbook.title = title;
  workbook.subject = scope;
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Transactions");
  sheet.columns = [
    { header: "Stock ID", key: "stockId", width: 14 },
    { header: "Date", key: "date", width: 14 },
    { header: "Company", key: "company", width: 18 },
    { header: "Location", key: "location", width: 12 },
    { header: "Item", key: "productName", width: 28 },
    { header: "Opening", key: "openingBalance", width: 14 },
    { header: "In", key: "inbound", width: 12 },
    { header: "Out", key: "outbound", width: 12 },
    { header: "Remark", key: "remark", width: 16 },
    { header: "Closing", key: "closingBalance", width: 14 },
    { header: "Posted by", key: "enteredBy", width: 24 },
    { header: "Status", key: "status", width: 16 },
  ];
  styleHeaderRow(sheet.getRow(1));

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
      remark: cfoTransactionRemarkExport(row.remark),
      closingBalance: row.closingBalance,
      enteredBy: enteredByLabel(row.enteredBy),
      status: statusLabel(pendingMap.has(String(row._id))),
    });
  }

  const totalsRow = sheet.addRow({
    productName: "TOTALS",
    openingBalance: summary.totals.openingBalance,
    inbound: summary.totals.inbound,
    outbound: summary.totals.outbound,
    closingBalance: summary.totals.closingBalance,
    enteredBy: `${summary.totals.recordCount} records`,
  });
  totalsRow.font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

async function sendTransactionDocx(res, { records, summary, pendingMap, title, scope, filename }) {
  const t = summary.totals;
  const header = new TableRow({
    children: [
      "Stock ID",
      "Date",
      "Company",
      "Item",
      "Opening",
      "In",
      "Out",
      "Remark",
      "Closing",
      "Posted by",
      "Status",
    ].map((label) =>
      cell(label, { bold: true, color: "FFFFFF", shading: "132337", width: 1100 })
    ),
  });

  const bodyRows = records.map(
    (row) =>
      new TableRow({
        children: [
          cell(row.stockId || "—"),
          cell(formatDate(row.date)),
          cell(
            row.location
              ? `${companyLabel(row.company, { short: true })} · ${row.location}`
              : companyLabel(row.company, { short: true })
          ),
          cell(row.productName),
          cell(formatNumber(row.openingBalance), { align: AlignmentType.RIGHT }),
          cell(formatNumber(row.inbound), { align: AlignmentType.RIGHT }),
          cell(formatNumber(row.outbound), { align: AlignmentType.RIGHT }),
          cell(cfoTransactionRemarkExport(row.remark)),
          cell(formatNumber(row.closingBalance), { align: AlignmentType.RIGHT }),
          cell(enteredByLabel(row.enteredBy) || "—"),
          cell(statusLabel(pendingMap.has(String(row._id)))),
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
            children: [new TextRun({ text: title, font: "Calibri", bold: true })],
          }),
          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: `${scope} · Generated ${new Date().toLocaleString()} · ${t.recordCount} records · Opening ${formatNumber(t.openingBalance)} · In ${formatNumber(t.inbound)} · Out ${formatNumber(t.outbound)} · Closing ${formatNumber(t.closingBalance)}`,
                italics: true,
                size: 20,
                color: "57534E",
              }),
            ],
          }),
          new Table({
            width: { size: 10080, type: WidthType.DXA },
            rows: bodyRows.length ? [header, ...bodyRows] : [header],
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
  res.setHeader("Content-Disposition", `attachment; filename="${filename}.docx"`);
  res.send(buffer);
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
    { header: "Remark", key: "remark", width: 16 },
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
      remark: cfoTransactionRemarkExport(row.remark),
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
      "Remark",
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
          cell(cfoTransactionRemarkExport(row.remark)),
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
    { header: "Remark", key: "remark", width: 16 },
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
      remark: cfoTransactionRemarkExport(row.remark),
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
      "Remark",
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
          cell(cfoTransactionRemarkExport(row.remark)),
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

router.get("/requests/excel", asyncHandler(async (_req, res) => {
  const {
    loadRequestExportRows,
    rowToExportRecord,
    DETAIL_HEADERS,
  } = require("../utils/requestExport");

  const rows = await loadRequestExportRows();

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Accessible Stock Dashboard";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Requests");
  sheet.columns = [
    { width: 14 },
    { width: 22 },
    { width: 48 },
    { width: 24 },
    { width: 14 },
    { width: 12 },
    { width: 14 },
    { width: 22 },
    { width: 22 },
  ];

  sheet.addRow(DETAIL_HEADERS);
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF132337" },
  };
  sheet.getColumn(1).numFmt = "@";

  rows.forEach((row) => {
    const excelRow = sheet.addRow(rowToExportRecord(row));
    excelRow.getCell(1).numFmt = "@";
  });

  if (rows.length) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: rows.length + 1, column: DETAIL_HEADERS.length },
    };
  }

  sheet.views = [{ state: "frozen", ySplit: 1 }];

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="cfo-requests-${stamp()}.xlsx"`
  );
  await workbook.xlsx.write(res);
  res.end();
}));

router.get("/requests/docx", asyncHandler(async (_req, res) => {
  const {
    loadRequestExportRows,
    summarizeRequestRows,
    summarizeByCategory,
  } = require("../utils/requestExport");

  const rows = await loadRequestExportRows();
  const summary = summarizeRequestRows(rows);
  const byCategory = summarizeByCategory(rows);

  const header = new TableRow({
    children: ["Category", "Date / time", "Submitted by", "Status", "Completed at"].map(
      (label) =>
        cell(label, { bold: true, color: "FFFFFF", shading: "132337", width: 1800 })
    ),
  });

  const bodyRows = rows.map(
    (row) =>
      new TableRow({
        children: [
          cell(row.requestCategory),
          cell(row.dateTime),
          cell(row.submittedBy),
          cell(row.statusLabel),
          cell(row.completedAt),
        ],
      })
  );

  const categorySummary = byCategory
    .map(
      (item) =>
        `${item.label} ${item.total} (Pending ${item.pending}, Processing ${item.processing}, Completed ${item.completed}, Rejected ${item.rejected})`
    )
    .join("  ·  ");

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [
              new TextRun({
                text: "CFO Requests Report",
                font: "Calibri",
                bold: true,
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: `Generated ${new Date().toLocaleString()} · ${summary.total} requests`,
                italics: true,
                size: 20,
                color: "57534E",
              }),
            ],
          }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: "Status summary", bold: true })],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Pending ${summary.pending}  ·  Processing ${summary.processing}  ·  Completed ${summary.completed}  ·  Rejected ${summary.rejected}  ·  Active ${summary.active}`,
                size: 22,
              }),
            ],
            spacing: { after: 160 },
          }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: "By request category", bold: true })],
          }),
          new Paragraph({
            children: [new TextRun({ text: categorySummary, size: 22 })],
            spacing: { after: 280 },
          }),
          new Paragraph({
            heading: HeadingLevel.HEADING_2,
            children: [new TextRun({ text: "All requests", bold: true })],
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
    `attachment; filename="cfo-requests-${stamp()}.docx"`
  );
  res.send(buffer);
}));

module.exports = router;
