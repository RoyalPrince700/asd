const mongoose = require("mongoose");
const { COMPANIES, ACCESSIBLE_LOCATIONS } = require("../constants/companies");
const {
  DEFAULT_TRANSACTION_REMARK,
  TRANSACTION_REMARKS,
} = require("../constants/transactionRemarks");

const snapshotFields = {
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
  remark: {
    type: String,
    enum: TRANSACTION_REMARKS,
    default: DEFAULT_TRANSACTION_REMARK,
  },
  stockReceived: { type: Number, required: true, min: 0, default: 0 },
  stockOut: { type: Number, required: true, min: 0, default: 0 },
  closingBalance: { type: Number, required: true, min: 0 },
};

const recordChangeSchema = new mongoose.Schema(
  {
    recordId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StockRecord",
      required: true,
    },
    originalSnapshot: snapshotFields,
    proposed: snapshotFields,
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedAt: { type: Date, default: null },
    rejectReason: { type: String, default: "" },
  },
  { timestamps: true }
);

recordChangeSchema.index({ recordId: 1, status: 1 });
recordChangeSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("RecordChange", recordChangeSchema);
