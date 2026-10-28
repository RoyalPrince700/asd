const mongoose = require("mongoose");
const {
  DEFAULT_TRANSACTION_REMARK,
  TRANSACTION_REMARKS,
} = require("../constants/transactionRemarks");

const pressMaterialRequestSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    nameKey: { type: String, required: true, trim: true, lowercase: true },
    stockId: { type: String, required: true, trim: true, unique: true },
    date: { type: Date, required: true },
    inbound: { type: Number, required: true, min: 0, default: 0 },
    outbound: { type: Number, required: true, min: 0, default: 0 },
    remark: {
      type: String,
      enum: TRANSACTION_REMARKS,
      default: DEFAULT_TRANSACTION_REMARK,
    },
    openingBalance: { type: Number, required: true, min: 0, default: 0 },
    closingBalance: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    source: {
      type: String,
      enum: ["manual", "upload"],
      default: "manual",
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
  },
  { timestamps: true }
);

pressMaterialRequestSchema.index({ status: 1, createdAt: -1 });
pressMaterialRequestSchema.index({ nameKey: 1, status: 1 });
pressMaterialRequestSchema.index({ submittedBy: 1, createdAt: -1 });

module.exports = mongoose.model("PressMaterialRequest", pressMaterialRequestSchema);
