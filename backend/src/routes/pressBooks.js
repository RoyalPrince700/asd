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
const PressBook = require("../models/PressBook");
const { PRESS_BOOK_CATEGORIES } = PressBook;
const { protect, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");

const router = express.Router();

router.use(protect);

const CATEGORY_LABELS = {
  wip: "Work in progress",
  finished: "Finished books",
};

const READ_ROLES = ["press", "press_manager", "accountant"];
const WRITE_ROLES = ["press", "press_manager"];

function titleKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function parseCategory(value) {
  const category = String(value || "").trim().toLowerCase();
  return PRESS_BOOK_CATEGORIES.includes(category) ? category : null;
}

function parseAmount(value, label) {
  if (value === "" || value === null || value === undefined) {
    return { error: `${label} is required.` };
  }
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    return { error: `${label} must be zero or greater.` };
  }
  return { value: Math.round(amount * 100) / 100 };
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function serialize(doc) {
  const quantity = Number(doc.quantity) || 0;
  const costPerUnit = Number(doc.costPerUnit) || 0;
  return {
    id: doc._id,
    category: doc.category,
    title: doc.title,
    quantity,
    costPerUnit,
    totalValue: Math.round(quantity * costPerUnit * 100) / 100,
    createdBy: doc.createdBy
      ? { id: doc.createdBy._id || doc.createdBy, name: doc.createdBy.name || "" }
      : null,
    updatedAt: doc.updatedAt,
    createdAt: doc.createdAt,
  };
}

function totalsFor(items) {
  return items.reduce(
    (sum, item) => {
      sum.count += 1;
      sum.quantity += item.quantity;
      sum.value += item.totalValue;
      return sum;
    },
    { count: 0, quantity: 0, value: 0 }
  );
}

function readPayload(body, { categoryRequired = true } = {}) {
  const title = String(body.title || "").trim().replace(/\s+/g, " ");
  if (!title) return { error: "Title is required." };
  if (title.length > 200) return { error: "Title must be 200 characters or fewer." };

  const quantity = parseAmount(body.quantity, "Quantity");
  if (quantity.error) return quantity;
  const costPerUnit = parseAmount(body.costPerUnit, "Cost per unit");
  if (costPerUnit.error) return costPerUnit;

  const payload = {
    title,
    titleKey: titleKey(title),
    quantity: quantity.value,
    costPerUnit: costPerUnit.value,
  };

  if (categoryRequired) {
    const category = parseCategory(body.category);
    if (!category) return { error: "Choose Work in progress or Finished books." };
    payload.category = category;
  }

  return { value: payload };
}

async function titleTaken(category, key, excludeId) {
  const filter = { category, titleKey: key };
  if (excludeId) filter._id = { $ne: excludeId };
  return PressBook.exists(filter);
}

async function loadCategory(category, search = "") {
  const filter = { category };
  const query = String(search || "").trim();
  if (query) filter.title = new RegExp(escapeRegex(query), "i");
  const docs = await PressBook.find(filter)
    .populate("createdBy", "name")
    .sort({ title: 1 })
    .lean();
  return docs.map(serialize);
}

function formatQty(value) {
  return Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-NG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function docCell(text, opts = {}) {
  return new TableCell({
    width: { size: opts.width || 1800, type: WidthType.DXA },
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

async function sendExcel(res, { items, label, filename }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Accessible Stock Dashboard";
  workbook.title = label;
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(label);
  sheet.columns = [
    { header: "Title", key: "title", width: 36 },
    { header: "Quantity", key: "quantity", width: 14 },
    { header: "Cost per unit", key: "costPerUnit", width: 18 },
    { header: "Total", key: "totalValue", width: 18 },
    { header: "Added by", key: "addedBy", width: 24 },
  ];
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF132337" },
  };

  for (const item of items) {
    sheet.addRow({
      title: item.title,
      quantity: item.quantity,
      costPerUnit: item.costPerUnit,
      totalValue: item.totalValue,
      addedBy: item.createdBy?.name || "",
    });
  }

  const totals = totalsFor(items);
  const totalsRow = sheet.addRow({
    title: "TOTALS",
    quantity: Math.round(totals.quantity * 100) / 100,
    totalValue: Math.round(totals.value * 100) / 100,
    addedBy: `${totals.count} titles`,
  });
  totalsRow.font = { bold: true };
  sheet.getColumn("costPerUnit").numFmt = "#,##0.00";
  sheet.getColumn("totalValue").numFmt = "#,##0.00";
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
}

async function sendDocx(res, { items, label, filename }) {
  const totals = totalsFor(items);
  const header = new TableRow({
    children: ["Title", "Quantity", "Cost per unit", "Total", "Added by"].map((name) =>
      docCell(name, { bold: true, color: "FFFFFF", shading: "132337" })
    ),
  });
  const body = items.map(
    (item) =>
      new TableRow({
        children: [
          docCell(item.title),
          docCell(formatQty(item.quantity), { align: AlignmentType.RIGHT }),
          docCell(formatMoney(item.costPerUnit), { align: AlignmentType.RIGHT }),
          docCell(formatMoney(item.totalValue), { align: AlignmentType.RIGHT }),
          docCell(item.createdBy?.name || "—"),
        ],
      })
  );

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            heading: HeadingLevel.HEADING_1,
            children: [new TextRun({ text: label, font: "Calibri", bold: true })],
          }),
          new Paragraph({
            spacing: { after: 200 },
            children: [
              new TextRun({
                text: `Press · Generated ${new Date().toLocaleString()} · ${totals.count} titles · Quantity ${formatQty(totals.quantity)} · Value ${formatMoney(totals.value)}`,
                italics: true,
                size: 20,
                color: "57534E",
              }),
            ],
          }),
          new Table({
            width: { size: 10080, type: WidthType.DXA },
            rows: [header, ...body],
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

router.get(
  "/export/:type",
  requireRole(...READ_ROLES),
  asyncHandler(async (req, res) => {
    const type = String(req.params.type || "").toLowerCase();
    if (type !== "excel" && type !== "docx") {
      res.status(404).json({ message: "Unknown report format." });
      return;
    }

    const category = parseCategory(req.query.category);
    if (!category) {
      res.status(400).json({ message: "Choose Work in progress or Finished books." });
      return;
    }

    const items = await loadCategory(category);
    const label = CATEGORY_LABELS[category];
    const filename = category === "wip" ? "work-in-progress" : "finished-books";

    if (type === "excel") {
      await sendExcel(res, { items, label, filename });
      return;
    }
    await sendDocx(res, { items, label, filename });
  })
);

router.get(
  "/",
  requireRole(...READ_ROLES),
  asyncHandler(async (req, res) => {
    const category = parseCategory(req.query.category);
    if (!category) {
      res.status(400).json({ message: "Choose Work in progress or Finished books." });
      return;
    }

    const search = String(req.query.search || "").trim();
    const items = await loadCategory(category, search);
    const totals = totalsFor(items);
    totals.quantity = Math.round(totals.quantity * 100) / 100;
    totals.value = Math.round(totals.value * 100) / 100;

    res.json({ items, totals, category });
  })
);

router.post(
  "/",
  requireRole(...WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const parsed = readPayload(req.body);
    if (parsed.error) {
      res.status(400).json({ message: parsed.error });
      return;
    }

    const { value } = parsed;
    if (await titleTaken(value.category, value.titleKey)) {
      res.status(409).json({
        message: `"${value.title}" is already in ${CATEGORY_LABELS[value.category]}. Edit that row to change the quantity or cost.`,
      });
      return;
    }

    try {
      const doc = await PressBook.create({
        ...value,
        createdBy: req.user._id,
        updatedBy: req.user._id,
      });
      await doc.populate("createdBy", "name");
      res.status(201).json({ item: serialize(doc) });
    } catch (err) {
      if (err?.code === 11000) {
        res.status(409).json({
          message: `"${value.title}" is already in ${CATEGORY_LABELS[value.category]}. Edit that row to change the quantity or cost.`,
        });
        return;
      }
      throw err;
    }
  })
);

router.put(
  "/:id",
  requireRole(...WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const doc = await PressBook.findById(req.params.id);
    if (!doc) {
      res.status(404).json({ message: "That title was not found." });
      return;
    }

    const parsed = readPayload(req.body, { categoryRequired: false });
    if (parsed.error) {
      res.status(400).json({ message: parsed.error });
      return;
    }

    const { value } = parsed;
    if (await titleTaken(doc.category, value.titleKey, doc._id)) {
      res.status(409).json({
        message: `"${value.title}" is already in ${CATEGORY_LABELS[doc.category]}.`,
      });
      return;
    }

    doc.title = value.title;
    doc.titleKey = value.titleKey;
    doc.quantity = value.quantity;
    doc.costPerUnit = value.costPerUnit;
    doc.updatedBy = req.user._id;

    try {
      await doc.save();
    } catch (err) {
      if (err?.code === 11000) {
        res.status(409).json({
          message: `"${value.title}" is already in ${CATEGORY_LABELS[doc.category]}.`,
        });
        return;
      }
      throw err;
    }

    await doc.populate("createdBy", "name");
    res.json({ item: serialize(doc) });
  })
);

router.delete(
  "/:id",
  requireRole(...WRITE_ROLES),
  asyncHandler(async (req, res) => {
    const doc = await PressBook.findByIdAndDelete(req.params.id);
    if (!doc) {
      res.status(404).json({ message: "That title was not found." });
      return;
    }
    res.json({ ok: true });
  })
);

module.exports = router;
