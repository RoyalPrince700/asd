const express = require("express");
const Category = require("../models/Category");
const { protect, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");

const router = express.Router();

router.use(protect);

router.get("/", asyncHandler(async (_req, res) => {
  const categories = await Category.find().sort({ name: 1 }).select("name");
  res.json({ categories: categories.map((c) => c.name) });
}));

router.post("/", requireRole("cfo"), asyncHandler(async (req, res) => {
  const name = String(req.body.name || "").trim();
  if (!name) {
    return res.status(400).json({ message: "Category name is required." });
  }

  const exists = await Category.findOne({ name });
  if (exists) {
    return res.status(400).json({ message: "That category already exists." });
  }

  const category = await Category.create({ name, createdBy: req.user._id });
  res.status(201).json({ category: category.name });
}));

router.delete("/:name", requireRole("cfo"), asyncHandler(async (req, res) => {
  const name = String(req.params.name || "").trim();
  const category = await Category.findOneAndDelete({ name });
  if (!category) {
    return res.status(404).json({ message: "Category not found." });
  }

  res.json({ message: "Category removed." });
}));

module.exports = router;
