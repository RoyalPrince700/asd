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
const { companyLabel } = require("../constants/companies");
const {
  buildAnalysis,
  fmtNum,
  fmtMoney,
  filterCatalog,
  stockLevelLabel,
  stockStatusLabel,
} = require("./analysis");

const PRODUCT_COLUMNS = [
  { header: "Company", key: "companyLabel", width: 24 },
  { header: "Item code", key: "itemCode", width: 18 },
  { header: "Product", key: "name", width: 42 },
  { header: "Left in stock", key: "balance", width: 16 },
  { header: "Unit price (N)", key: "unitPrice", width: 16 },
  { header: "Value left (N)", key: "stockValue", width: 18 },
  { header: "Status", key: "statusLabel", width: 18 },
];

function scopeLabel(companyFilter) {
  if (!companyFilter || companyFilter === "all") {
    return "All companies";
  }
  return companyLabel(companyFilter);
}

function periodLabel(query = {}) {
  if (query.from && query.to) return `${query.from} to ${query.to}`;
  if (query.from) return `From ${query.from}`;
  if (query.to) return `To ${query.to}`;
  return "All dates";
}

function styleHeader(row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF132337" },
  };
}

function priceNote(company) {
  if (company === "accessible") {
    return "Value left is quantity remaining × sale price.";
  }
  if (company === "trifone" || company === "electronics") {
    return "Value left is quantity remaining × cost price.";
  }
  if (company === "press") {
    return "Press materials have no price on file, so value left is blank.";
  }
  return "Accessible Publishers uses sale price. Trifone Gadgets and Trifone Electronics use cost price. Press has no price on file.";
}

function exportRows(data, query) {
  return filterCatalog(data.products || [], query.stockLevel).map((row) => {
    const balance = Number(row.balance) || 0;
    const unitPrice = Number(row.unitPrice) || 0;
    const hasPrice = Boolean(row.priceBasis);
    return {
      ...row,
      statusLabel: row.statusLabel || stockStatusLabel(row.status),
      itemCode: row.itemCode || "",
      priceBasis: row.priceBasis || "—",
      balance,
      unitPrice: hasPrice ? unitPrice : null,
      stockValue: hasPrice ? balance * unitPrice : null,
    };
  });
}

function productTotals(rows) {
  return rows.reduce(
    (totals, row) => {
      totals.balance += Number(row.balance) || 0;
      if (row.stockValue != null) totals.stockValue += Number(row.stockValue) || 0;
      return totals;
    },
    { balance: 0, stockValue: 0 }
  );
}

async function buildAnalysisWorkbook(data, query = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Accessible Stock Dashboard";
  workbook.created = new Date();
  workbook.views = [{ activeTab: 0, firstSheet: 0 }];

  const sheet = workbook.addWorksheet("Products", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.columns = PRODUCT_COLUMNS;
  styleHeader(sheet.getRow(1));

  const rows = exportRows(data, query);
  if (!rows.length) {
    sheet.addRow({
      companyLabel: scopeLabel(data.company),
      name: "No products match this company and stock filter.",
    });
  } else {
    for (const row of rows) {
      sheet.addRow({
        companyLabel: row.companyLabel,
        itemCode: row.itemCode,
        name: row.name,
        balance: row.balance,
        unitPrice: row.unitPrice,
        stockValue: row.stockValue,
        statusLabel: row.statusLabel,
      });
    }
    const totals = productTotals(rows);
    const totalsRow = sheet.addRow({
      companyLabel: "",
      itemCode: "",
      name: "TOTAL",
      balance: totals.balance,
      unitPrice: null,
      stockValue: totals.stockValue,
      statusLabel: `${rows.length} products`,
    });
    totalsRow.font = { bold: true };
  }

  sheet.getColumn("balance").numFmt = "#,##0";
  sheet.getColumn("unitPrice").numFmt = "#,##0.00";
  sheet.getColumn("stockValue").numFmt = "#,##0.00";
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: PRODUCT_COLUMNS.length },
  };

  return workbook;
}

function moneyCell(value) {
  if (value == null) return "—";
  return fmtMoney(value);
}

function docxCell(text, opts = {}) {
  return new TableCell({
    width: { size: opts.width || 1400, type: WidthType.DXA },
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

function productDocxRow(row, bold = false) {
  return new TableRow({
    children: [
      docxCell(row.companyLabel, { width: 1400, bold }),
      docxCell(row.itemCode, { width: 1200, bold }),
      docxCell(row.name, { width: 2200, bold }),
      docxCell(row.balance == null ? "" : fmtNum(row.balance), {
        width: 900,
        align: AlignmentType.RIGHT,
        bold,
      }),
      docxCell(moneyCell(row.unitPrice), { width: 1200, align: AlignmentType.RIGHT, bold }),
      docxCell(moneyCell(row.stockValue), { width: 1400, align: AlignmentType.RIGHT, bold }),
      docxCell(row.statusLabel || "", { width: 1300, bold }),
    ],
  });
}

async function buildAnalysisDocxBuffer(data, query = {}) {
  const rows = exportRows(data, query);
  const totals = productTotals(rows);
  const header = new TableRow({
    tableHeader: true,
    children: ["Company", "Item code", "Product", "Left", "Unit price", "Value left", "Status"].map(
      (label) => docxCell(label, { bold: true, color: "FFFFFF", shading: "132337", width: 1400 })
    ),
  });
  const body = rows.length
    ? rows.map((row) => productDocxRow(row))
    : [
        productDocxRow({
          companyLabel: "",
          itemCode: "",
          name: "No products match this company and stock filter.",
          balance: null,
          unitPrice: null,
          stockValue: null,
          statusLabel: "",
        }),
      ];
  const totalRow = productDocxRow(
    {
      companyLabel: "",
      itemCode: "",
      name: "TOTAL",
      balance: totals.balance,
      unitPrice: null,
      stockValue: totals.stockValue,
      statusLabel: `${rows.length} products`,
    },
    true
  );

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [
              new TextRun({
                text: `${scopeLabel(data.company)} — stock on hand`,
                font: "Calibri",
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 80 },
            children: [
              new TextRun({
                text: `${periodLabel(query)} · ${stockLevelLabel(query.stockLevel)} · ${rows.length.toLocaleString()} product(s) · ${fmtNum(totals.balance)} left · ${fmtMoney(totals.stockValue)}`,
                font: "Calibri",
                size: 20,
                color: "57534E",
              }),
            ],
          }),
          new Paragraph({
            spacing: { after: 160 },
            children: [
              new TextRun({
                text: priceNote(data.company),
                italics: true,
                font: "Calibri",
                size: 18,
                color: "57534E",
              }),
            ],
          }),
          new Table({
            width: { size: 9638, type: WidthType.DXA },
            rows: [header, ...body, ...(rows.length ? [totalRow] : [])],
          }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

module.exports = {
  buildAnalysisWorkbook,
  buildAnalysisDocxBuffer,
  buildAnalysis,
};
