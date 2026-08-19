const mongoose = require("mongoose");
const { COMPANIES, ACCESSIBLE_LOCATIONS } = require("../constants/companies");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true },
    role: {
      type: String,
      enum: ["clerk", "cfo", "accountant", "admin"],
      required: true,
    },
    assignedCompany: {
      type: String,
      enum: [...Object.values(COMPANIES), null],
      default: null,
    },
    location: {
      type: String,
      enum: [...ACCESSIBLE_LOCATIONS, null],
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
