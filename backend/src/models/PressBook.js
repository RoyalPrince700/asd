const mongoose = require("mongoose");

const CATEGORIES = ["wip", "finished"];

const pressBookSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      required: true,
      enum: CATEGORIES,
    },
    title: { type: String, required: true, trim: true },
    titleKey: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 0 },
    costPerUnit: { type: Number, required: true, min: 0 },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

pressBookSchema.index({ category: 1, titleKey: 1 }, { unique: true });

module.exports = mongoose.model("PressBook", pressBookSchema);
module.exports.PRESS_BOOK_CATEGORIES = CATEGORIES;
