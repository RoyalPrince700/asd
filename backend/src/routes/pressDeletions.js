const express = require("express");
const PressDeletionLog = require("../models/PressDeletionLog");
const { protect, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");
const { normalizeStockIdInput } = require("../utils/stockId");

const router = express.Router();

router.use(protect);

router.get(
  "/",
  requireRole("press_manager"),
  asyncHandler(async (req, res) => {
    const filter = {};
    const stockId = normalizeStockIdInput(req.query.stockId);
    if (stockId) filter.stockId = stockId;

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));

    const [total, deletions] = await Promise.all([
      PressDeletionLog.countDocuments(filter),
      PressDeletionLog.find(filter)
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
