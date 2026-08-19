const express = require("express");
const User = require("../models/User");
const { protect, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");
const { COMPANIES, ACCESSIBLE_LOCATIONS } = require("../constants/companies");

const router = express.Router();

function publicStaff(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    assignedCompany: user.assignedCompany || null,
    location: user.location || null,
    createdAt: user.createdAt,
  };
}

function applyStaffAssignment(user, assignment) {
  if (assignment === null || assignment === "" || assignment === undefined) {
    user.assignedCompany = null;
    user.location = null;
    return;
  }

  const normalized = String(assignment).trim().toLowerCase();

  if (isLocationlessCompany(normalized)) {
    user.assignedCompany = normalized;
    user.location = null;
    return;
  }

  const location = String(assignment).trim().toUpperCase();
  if (!ACCESSIBLE_LOCATIONS.includes(location)) {
    throw new Error(
      `Invalid assignment. Choose Trifone Gadgets, Trifone Electronics, or one of: ${ACCESSIBLE_LOCATIONS.join(", ")}`
    );
  }

  user.assignedCompany = COMPANIES.ACCESSIBLE;
  user.location = location;
}

router.use(protect, requireRole("cfo"));

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const staff = await User.find({ role: { $in: ["clerk", "accountant"] } })
      .sort({ createdAt: -1 })
      .select("-password");
    res.json({ staff: staff.map(publicStaff) });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: "Staff member not found" });
    }

    if (user.role !== "clerk" && user.role !== "accountant") {
      return res.status(400).json({
        message: "Only clerk or accountant accounts can be managed here.",
      });
    }

    const { assignment, location, assignedCompany, role } = req.body;

    if (role !== undefined) {
      const allowed = ["clerk", "accountant"];
      if (!allowed.includes(role)) {
        return res.status(400).json({ message: "Role must be clerk or accountant." });
      }
      user.role = role;
      if (role === "accountant") {
        user.assignedCompany = null;
        user.location = null;
      }
    }

    if (user.role === "accountant") {
      await user.save();
      return res.json({ staff: publicStaff(user) });
    }

    try {
      if (assignment !== undefined) {
        applyStaffAssignment(user, assignment);
      } else if (assignedCompany !== undefined || location !== undefined) {
        if (isLocationlessCompany(assignedCompany)) {
          applyStaffAssignment(user, assignedCompany);
        } else if (location) {
          applyStaffAssignment(user, location);
        } else if (!assignedCompany && !location) {
          applyStaffAssignment(user, null);
        } else {
          return res.status(400).json({
            message: "Provide a Trifone Gadgets, Trifone Electronics, or APL location assignment.",
          });
        }
      } else if (role === undefined) {
        return res.status(400).json({ message: "Assignment or role is required." });
      }
    } catch (err) {
      return res.status(400).json({ message: err.message });
    }

    await user.save();
    res.json({ staff: publicStaff(user) });
  })
);

module.exports = router;
