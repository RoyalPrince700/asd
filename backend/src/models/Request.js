const mongoose = require("mongoose");

const requestSchema = new mongoose.Schema(
  {
    request: {
      type: String,
      enum: ["credit", "expense", "stock_issues"],
      required: true,
    },
    date: { type: String, required: true, trim: true },
    time: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "rejected"],
      default: "pending",
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

requestSchema.index({ date: -1, time: -1 });
requestSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("Request", requestSchema);
