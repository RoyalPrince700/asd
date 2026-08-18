const mongoose = require("mongoose");

const stockRecordSchema = new mongoose.Schema(
  {
    productName: { type: String, required: true, trim: true },
    category: { type: String, required: true, trim: true },
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

stockRecordSchema.index({ date: -1, productName: 1, category: 1 });

module.exports = mongoose.model("StockRecord", stockRecordSchema);
