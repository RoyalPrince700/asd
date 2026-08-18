const express = require("express");
const RecordChange = require("../models/RecordChange");
const StockRecord = require("../models/StockRecord");
const { protect, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");
const { applySnapshot } = require("../utils/recordChanges");

const router = express.Router();

router.use(protect);

router.get("/", requireRole("cfo"), asyncHandler(async (req, res) => {
  const status = String(req.query.status || "pending").trim().toLowerCase();
  const filter = { status: ["pending", "approved", "rejected"].includes(status) ? status : "pending" };

  const changes = await RecordChange.find(filter)
    .populate("submittedBy", "name email role")
    .populate("reviewedBy", "name email role")
    .populate({
      path: "recordId",
      populate: { path: "enteredBy", select: "name email role" },
    })
    .sort({ createdAt: -1 });

  res.json({ changes, total: changes.length });
}));

router.post("/:id/approve", requireRole("cfo"), asyncHandler(async (req, res) => {
  const change = await RecordChange.findById(req.params.id);

  if (!change) {
    return res.status(404).json({ message: "Edit request not found." });
  }

  if (change.status !== "pending") {
    return res.status(400).json({ message: "This edit has already been reviewed." });
  }

  const record = await StockRecord.findById(change.recordId);
  if (!record) {
    return res.status(404).json({ message: "The underlying transaction no longer exists." });
  }

  change.status = "approved";
  change.reviewedBy = req.user._id;
  change.reviewedAt = new Date();
  await change.save();

  const populated = await change.populate([
    { path: "submittedBy", select: "name email role" },
    { path: "reviewedBy", select: "name email role" },
    {
      path: "recordId",
      populate: { path: "enteredBy", select: "name email role" },
    },
  ]);

  res.json({ change: populated, message: "Edit approved and is now permanent." });
}));

router.post("/:id/reject", requireRole("cfo"), asyncHandler(async (req, res) => {
  const change = await RecordChange.findById(req.params.id);

  if (!change) {
    return res.status(404).json({ message: "Edit request not found." });
  }

  if (change.status !== "pending") {
    return res.status(400).json({ message: "This edit has already been reviewed." });
  }

  const record = await StockRecord.findById(change.recordId);
  if (!record) {
    return res.status(404).json({ message: "The underlying transaction no longer exists." });
  }

  applySnapshot(record, change.originalSnapshot);
  await record.save();

  change.status = "rejected";
  change.reviewedBy = req.user._id;
  change.reviewedAt = new Date();
  change.rejectReason = String(req.body?.reason || "").trim();
  await change.save();

  const populated = await change.populate([
    { path: "submittedBy", select: "name email role" },
    { path: "reviewedBy", select: "name email role" },
    {
      path: "recordId",
      populate: { path: "enteredBy", select: "name email role" },
    },
  ]);

  res.json({
    change: populated,
    record,
    message: "Edit rejected. Transaction reverted to its previous values.",
  });
}));

module.exports = router;
