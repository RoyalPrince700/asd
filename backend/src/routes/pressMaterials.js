const express = require("express");
const PressMaterialRequest = require("../models/PressMaterialRequest");
const { protect, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");
const {
  queuePressMaterials,
  approvePressMaterial,
  rejectPressMaterial,
} = require("../utils/pressMaterials");

const router = express.Router();

router.use(protect);

function sendKnownError(res, err) {
  if (err.status && err.status < 500) {
    res.status(err.status).json({ message: err.message });
    return true;
  }
  return false;
}

router.get(
  "/",
  requireRole("press", "press_manager"),
  asyncHandler(async (req, res) => {
    const filter = {};
    if (req.user.role === "press") {
      filter.submittedBy = req.user._id;
    }

    const status = String(req.query.status || "").trim().toLowerCase();
    if (["pending", "approved", "rejected"].includes(status)) {
      filter.status = status;
    }

    const materials = await PressMaterialRequest.find(filter)
      .populate("submittedBy", "name email role")
      .populate("reviewedBy", "name email role")
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    res.json({ materials });
  })
);

router.post(
  "/",
  requireRole("press"),
  asyncHandler(async (req, res) => {
    const date = req.body.date ? new Date(req.body.date) : new Date();
    if (Number.isNaN(date.getTime())) {
      return res.status(400).json({ message: "Enter a valid date." });
    }

    const { created, skipped } = await queuePressMaterials(
      [
        {
          name: req.body.name,
          inbound: req.body.inbound,
          outbound: req.body.outbound,
        },
      ],
      {
        submittedBy: req.user._id,
        date,
        remark: req.body.remark,
        source: "manual",
      }
    );

    if (!created.length) {
      return res.status(400).json({
        message: skipped[0]?.message || "Could not add this raw material.",
      });
    }

    const material = created[0];
    res.status(201).json({
      material,
      message: `Submitted for approval. Stock ID ${material.stockId}.`,
    });
  })
);

router.post(
  "/:id/approve",
  requireRole("press_manager"),
  asyncHandler(async (req, res) => {
    try {
      const material = await approvePressMaterial(req.params.id, req.user._id);
      res.json({
        material,
        message: `${material.name} is now in the Press catalog. Stock ID ${material.stockId}.`,
      });
    } catch (err) {
      if (sendKnownError(res, err)) return;
      throw err;
    }
  })
);

router.post(
  "/:id/reject",
  requireRole("press_manager"),
  asyncHandler(async (req, res) => {
    try {
      const material = await rejectPressMaterial(req.params.id, req.user._id);
      res.json({
        material,
        message: `${material.name} was rejected and will not be added to inventory.`,
      });
    } catch (err) {
      if (sendKnownError(res, err)) return;
      throw err;
    }
  })
);

module.exports = router;
