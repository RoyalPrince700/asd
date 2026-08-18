const mongoose = require("mongoose");
const { COMPANIES } = require("../constants/companies");

const catalogConfigSchema = new mongoose.Schema(
  {
    company: {
      type: String,
      required: true,
      enum: Object.values(COMPANIES),
      unique: true,
    },
    hiddenColumns: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("CatalogConfig", catalogConfigSchema);
