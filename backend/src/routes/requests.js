const express = require("express");
const Request = require("../models/Request");
const { protect, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");

const router = express.Router();

const REQUEST_TYPES = ["credit", "expense", "stock_issues"];
const STATUSES = ["pending", "processing", "completed", "rejected"];

function resolveStatus(doc) {
  if (doc.status && STATUSES.includes(doc.status)) return doc.status;
  if (doc.done === true) return "completed";
  return "pending";
}

function publicRequest(doc) {
  const status = resolveStatus(doc);
  return {
    id: doc._id,
    request: doc.request,
    details: doc.details || "",
    date: doc.date,
    time: doc.time,
    status,
    submittedBy: doc.submittedBy,
    completedAt: doc.completedAt,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

function sortKey(doc) {
  return `${doc.date}T${doc.time || "00:00"}`;
}

function sortRequests(items, { status, queue } = {}) {
  const isCompletedView = status === "completed" || queue === "completed";

  if (isCompletedView) {
    items.sort((a, b) => {
      const aAt = a.doc.completedAt || a.doc.updatedAt || a.doc.createdAt;
      const bAt = b.doc.completedAt || b.doc.updatedAt || b.doc.createdAt;
      return new Date(bAt) - new Date(aAt);
    });
    return;
  }

  items.sort((a, b) => sortKey(a.doc).localeCompare(sortKey(b.doc)));
}

router.use(protect);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const { status, queue } = req.query;
    const filter = {};

    if (req.user.role !== "cfo") {
      filter.submittedBy = req.user._id;
    }

    const requests = await Request.find(filter)
      .populate("submittedBy", "name email role")
      .sort({ createdAt: -1 });

    let mapped = requests.map((doc) => ({ doc, status: resolveStatus(doc) }));

    if (queue === "active") {
      mapped = mapped.filter((item) => item.status !== "completed");
    } else if (status && STATUSES.includes(status)) {
      mapped = mapped.filter((item) => item.status === status);
    }

    sortRequests(mapped, { status, queue });

    res.json({ requests: mapped.map((item) => publicRequest(item.doc)) });
  })
);

router.post(
  "/",
  asyncHandler(async (req, res) => {
    const { request, date, time, details } = req.body;

    const requestType = String(request || "").trim();
    if (!REQUEST_TYPES.includes(requestType)) {
      return res.status(400).json({ message: "Please select a request type." });
    }

    const requestDate = String(date || "").trim();
    if (!requestDate) {
      return res.status(400).json({ message: "Date is required." });
    }

    const requestTime = String(time || "").trim();
    if (!requestTime) {
      return res.status(400).json({ message: "Time is required." });
    }

    const doc = await Request.create({
      request: requestType,
      details: String(details || "").trim(),
      date: requestDate,
      time: requestTime,
      status: "pending",
      submittedBy: req.user._id,
    });

    await doc.populate("submittedBy", "name email role");
    res.status(201).json({ request: publicRequest(doc) });
  })
);

router.patch(
  "/:id",
  requireRole("cfo"),
  asyncHandler(async (req, res) => {
    const doc = await Request.findById(req.params.id);
    if (!doc) {
      return res.status(404).json({ message: "Request not found." });
    }

    const { status } = req.body;

    if (status !== undefined) {
      if (!STATUSES.includes(status)) {
        return res.status(400).json({ message: "Invalid status." });
      }
      doc.status = status;
      doc.completedAt = status === "completed" ? new Date() : null;
    }

    await doc.save();
    await doc.populate("submittedBy", "name email role");
    res.json({ request: publicRequest(doc) });
  })
);

router.delete(
  "/:id",
  requireRole("cfo"),
  asyncHandler(async (req, res) => {
    const doc = await Request.findByIdAndDelete(req.params.id);
    if (!doc) {
      return res.status(404).json({ message: "Request not found." });
    }

    res.json({ ok: true });
  })
);

module.exports = router;
