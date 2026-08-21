const express = require("express");
const User = require("../models/User");
const { protect, requireRole } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");
const { COMPANIES, ACCESSIBLE_LOCATIONS, isLocationlessCompany } = require("../constants/companies");

const router = express.Router();

console.log("[staff] route loaded", {
  isLocationlessCompany: typeof isLocationlessCompany,
  companies: Object.values(COMPANIES),
  locations: ACCESSIBLE_LOCATIONS,
});

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
  console.log("[staff] applyStaffAssignment", {
    userId: String(user._id),
    assignment,
    assignmentType: typeof assignment,
    before: {
      assignedCompany: user.assignedCompany,
      location: user.location,
      role: user.role,
    },
  });

  if (assignment === null || assignment === "" || assignment === undefined) {
    user.assignedCompany = null;
    user.location = undefined;
    return;
  }

  const normalized = String(assignment).trim().toLowerCase();

  if (isLocationlessCompany(normalized)) {
    user.assignedCompany = normalized;
    user.location = undefined;
    console.log("[staff] assigned locationless company", { normalized });
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
  console.log("[staff] assigned APL location", { location });
}

router.use(protect, requireRole("cfo"));

router.get(
  "/",
  asyncHandler(async (_req, res) => {
    const staff = await User.find({ role: { $in: ["clerk", "accountant", "trifone"] } })
      .sort({ createdAt: -1 })
      .select("-password");
    res.json({ staff: staff.map(publicStaff) });
  })
);

router.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    console.log("[staff PATCH] incoming", {
      paramsId: req.params.id,
      body: req.body,
      actor: {
        id: String(req.user?._id || ""),
        email: req.user?.email,
        role: req.user?.role,
      },
    });

    const user = await User.findById(req.params.id);
    if (!user) {
      console.warn("[staff PATCH] not found", req.params.id);
      return res.status(404).json({ message: "Staff member not found" });
    }

    if (!["clerk", "accountant", "trifone"].includes(user.role)) {
      console.warn("[staff PATCH] invalid role to manage", user.role);
      return res.status(400).json({
        message: "Only clerk, accountant, or trifone accounts can be managed here.",
      });
    }

    const { assignment, location, assignedCompany, role } = req.body;

    if (role !== undefined) {
      const allowed = ["clerk", "accountant", "trifone"];
      if (!allowed.includes(role)) {
        return res.status(400).json({ message: "Role must be clerk, accountant, or trifone." });
      }
      user.role = role;
      if (role === "accountant" || role === "trifone") {
        user.assignedCompany = null;
        user.location = undefined;
      }
    }

    if (user.role === "accountant" || user.role === "trifone") {
      await user.save();
      console.log(`[staff PATCH] saved ${user.role}`, publicStaff(user));
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
      console.error("[staff PATCH] assignment rejected", {
        message: err.message,
        stack: err.stack,
      });
      return res.status(400).json({ message: err.message });
    }

    try {
      await user.save();
    } catch (err) {
      console.error("[staff PATCH] mongoose save failed", {
        name: err.name,
        message: err.message,
        errors: err.errors
          ? Object.fromEntries(
              Object.entries(err.errors).map(([key, value]) => [
                key,
                value.message,
              ])
            )
          : undefined,
      });
      return res.status(400).json({
        message: err.message || "Could not save staff assignment.",
      });
    }

    console.log("[staff PATCH] saved", publicStaff(user));
    res.json({ staff: publicStaff(user) });
  })
);

module.exports = router;
