const express = require("express");
const { protect, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");
const { buildAnalysis } = require("../utils/analysis");
const {
  buildAnalysisWorkbook,
  buildAnalysisDocxBuffer,
} = require("../utils/analysisExport");

const router = express.Router();

router.use(protect, requireRole("cfo", "md"));

function stamp(query = {}) {
  const company = String(query.company || "all").replace(/[^a-z0-9-]/gi, "") || "all";
  const level = String(query.stockLevel || "all").replace(/[^a-z0-9-]/gi, "") || "all";
  return `${company}-${level}-${new Date().toISOString().slice(0, 10)}`;
}

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const data = await buildAnalysis(req.query);
    res.json(data);
  })
);

router.get(
  "/excel",
  asyncHandler(async (req, res) => {
    const data = await buildAnalysis({ ...req.query, includeProducts: "1" });
    const workbook = await buildAnalysisWorkbook(data, req.query);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="cfo-analysis-${stamp(req.query)}.xlsx"`
    );
    await workbook.xlsx.write(res);
    res.end();
  })
);

router.get(
  "/docx",
  asyncHandler(async (req, res) => {
    const data = await buildAnalysis({ ...req.query, includeProducts: "1" });
    const buffer = await buildAnalysisDocxBuffer(data, req.query);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="cfo-analysis-${stamp(req.query)}.docx"`
    );
    res.send(buffer);
  })
);

module.exports = router;
