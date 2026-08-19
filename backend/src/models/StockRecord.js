const mongoose = require("mongoose");
const { COMPANIES, ACCESSIBLE_LOCATIONS } = require("../constants/companies");

const stockRecordSchema = new mongoose.Schema(
  {
    stockId: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    productName: { type: String, required: true, trim: true },
    company: {
      type: String,
      required: true,
      enum: Object.values(COMPANIES),
    },
    location: {
      type: String,
      enum: ACCESSIBLE_LOCATIONS,
      default: null,
    },
    date: { type: Date, required: true },
    openingBalance: { type: Number, required: true, min: 0 },
    inbound: { type: Number, required: true, min: 0, default: 0 },
    outbound: { type: Number, required: true, min: 0, default: 0 },
    stockReceived: { type: Number, required: true, min: 0, default: 0 },
    stockOut: { type: Number, required: true, min: 0, default: 0 },
    closingBalance: { type: Number, required: true, min: 0 },
    enteredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

stockRecordSchema.index({ date: -1, productName: 1, company: 1, location: 1 });

module.exports = mongoose.model("StockRecord", stockRecordSchema);
