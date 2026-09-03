const mongoose = require("mongoose");
const { COMPANIES, ACCESSIBLE_LOCATIONS } = require("../constants/companies");

const stockSchema = new mongoose.Schema(
  Object.fromEntries(
    ACCESSIBLE_LOCATIONS.map((loc) => [loc, { type: Number, default: 0, min: 0 }])
  ),
  { _id: false }
);

const trifoneDataSchema = new mongoose.Schema(
  {
    openingStock: { type: Number, default: 0, min: 0 },
    closingStock: { type: Number, default: 0, min: 0 },
    costPrice: { type: Number, default: 0, min: 0 },
  },
  { _id: false, strict: false }
);

const electronicsDataSchema = new mongoose.Schema(
  {
    openingStock: { type: Number, default: 0, min: 0 },
    closingStock: { type: Number, default: 0, min: 0 },
  },
  { _id: false, strict: false }
);

const pressDataSchema = new mongoose.Schema(
  {
    openingStock: { type: Number, default: 0, min: 0 },
    closingStock: { type: Number, default: 0, min: 0 },
  },
  { _id: false, strict: false }
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
    salePrice: {
      type: Number,
      default: 0,
      min: 0,
    },
    trifoneData: {
      type: trifoneDataSchema,
      default: undefined,
    },
    electronicsData: {
      type: electronicsDataSchema,
      default: undefined,
    },
    pressData: {
      type: pressDataSchema,
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
