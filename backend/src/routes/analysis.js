const express = require("express");
const { protect, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");
const { buildAnalysis } = require("../utils/analysis");

const router = express.Router();

router.use(protect, requireRole("cfo"));

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const data = await buildAnalysis(req.query);
    res.json(data);
  })
);

router.get(
  "/markdown",
  asyncHandler(async (req, res) => {
    const data = await buildAnalysis(req.query);
    const filename = `cfo-analysis-${data.generatedAt.slice(0, 10)}.md`;
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(data.markdown);
  })
);

module.exports = router;
