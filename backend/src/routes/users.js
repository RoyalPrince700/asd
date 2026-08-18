const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const { protect, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");

const router = express.Router();

function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  };
}

router.use(protect, requireRole("admin"));

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const users = await User.find().sort({ createdAt: -1 }).select("-password");
    res.json({ users: users.map(publicUser) });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const { name, email, role } = req.body;

    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) {
        return res.status(400).json({ message: "Name is required" });
      }
      user.name = trimmed;
    }

    if (email !== undefined) {
      const normalized = String(email).toLowerCase().trim();
      if (!normalized) {
        return res.status(400).json({ message: "Email is required" });
      }
      const exists = await User.findOne({ email: normalized, _id: { $ne: user._id } });
      if (exists) {
        return res.status(409).json({ message: "Email already in use" });
      }
      user.email = normalized;
    }

    if (role !== undefined) {
      const allowed = ["clerk", "cfo", "admin"];
      if (!allowed.includes(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      user.role = role;
    }

    await user.save();
    res.json({ user: publicUser(user) });
  })
);

router.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    if (String(req.user._id) === String(req.params.id)) {
      return res.status(400).json({ message: "You cannot delete your own account" });
    }

    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ ok: true });
  })
);

module.exports = router;
