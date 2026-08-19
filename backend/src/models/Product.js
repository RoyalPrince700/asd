const mongoose = require("mongoose");
const {
  COMPANIES,
  ACCESSIBLE_LOCATIONS,
  TRIFONE_AUGUST_FIELDS,
} = require("../constants/companies");

const stockSchema = new mongoose.Schema(
  Object.fromEntries(
    ACCESSIBLE_LOCATIONS.map((loc) => [loc, { type: Number, default: 0, min: 0 }])
  ),
  { _id: false }
);

const trifoneDataSchema = new mongoose.Schema(
  Object.fromEntries(
    TRIFONE_AUGUST_FIELDS.map((field) => {
      if (field.type === "text") {
        return [field.key, { type: String, default: "" }];
      }
      return [field.key, { type: Number, default: 0, min: 0 }];
    })
  ),
  { _id: false }
);

const electronicsDataSchema = new mongoose.Schema(
  {
    currentStock: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    company: {
      type: String,
      required: true,
      enum: Object.values(COMPANIES),
      default: COMPANIES.ACCESSIBLE,
    },
    stock: {
      type: stockSchema,
      default: undefined,
    },
    trifoneData: {
      type: trifoneDataSchema,
      default: undefined,
    },
    electronicsData: {
      type: electronicsDataSchema,
      default: undefined,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { timestamps: true }
);

productSchema.index({ company: 1, name: 1 }, { unique: true });

module.exports = mongoose.model("Product", productSchema);
