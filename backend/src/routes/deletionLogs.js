const express = require("express");
const DeletionLog = require("../models/DeletionLog");
const { protect, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");
const { isValidCompany } = require("../constants/companies");
const { normalizeStockIdInput } = require("../utils/stockId");

const router = express.Router();

router.use(protect);

router.get(
  "/",
  requireRole("cfo"),
  asyncHandler(async (req, res) => {
    const filter = {};
    const stockId = normalizeStockIdInput(req.query.stockId);
    if (stockId) filter.stockId = stockId;

    const company = String(req.query.company || "").trim().toLowerCase();
    if (company) {
      if (!isValidCompany(company)) {
        return res.status(400).json({ message: "Invalid company." });
      }
      filter.company = company;
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));

    const [total, deletions] = await Promise.all([
      DeletionLog.countDocuments(filter),
      DeletionLog.find(filter)
        .populate("enteredBy", "name email role")
        .populate("deletedBy", "name email role")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    res.json({
      deletions,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  })
);

module.exports = router;
