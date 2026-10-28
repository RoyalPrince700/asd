const mongoose = require("mongoose");
const { COMPANIES, ACCESSIBLE_LOCATIONS } = require("../constants/companies");
const {
  DEFAULT_TRANSACTION_REMARK,
  TRANSACTION_REMARKS,
} = require("../constants/transactionRemarks");

const deletionLogSchema = new mongoose.Schema(
  {
    recordId: { type: mongoose.Schema.Types.ObjectId, required: true },
    stockId: { type: String, default: "", trim: true },
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
    enteredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

deletionLogSchema.index({ recordId: 1 }, { unique: true });
deletionLogSchema.index({ createdAt: -1 });
deletionLogSchema.index({ company: 1, createdAt: -1 });
deletionLogSchema.index({ stockId: 1 });

module.exports = mongoose.model("DeletionLog", deletionLogSchema);
