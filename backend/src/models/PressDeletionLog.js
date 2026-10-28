const mongoose = require("mongoose");
const {
  DEFAULT_TRANSACTION_REMARK,
  TRANSACTION_REMARKS,
} = require("../constants/transactionRemarks");

const pressDeletionLogSchema = new mongoose.Schema(
  {
    recordId: { type: mongoose.Schema.Types.ObjectId, required: true },
    stockId: { type: String, default: "", trim: true },
    productName: { type: String, required: true, trim: true },
    date: { type: Date, required: true },
    openingBalance: { type: Number, required: true, min: 0 },
    inbound: { type: Number, required: true, min: 0, default: 0 },
    outbound: { type: Number, required: true, min: 0, default: 0 },
    remark: {
      type: String,
      enum: TRANSACTION_REMARKS,
      default: DEFAULT_TRANSACTION_REMARK,
    },
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

pressDeletionLogSchema.index({ createdAt: -1 });
pressDeletionLogSchema.index({ stockId: 1 });

module.exports = mongoose.model("PressDeletionLog", pressDeletionLogSchema);
