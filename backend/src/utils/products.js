const Product = require("../models/Product");

async function isValidProductName(name) {
  if (!name) return false;
  const exists = await Product.exists({ name: String(name).trim() });
  return Boolean(exists);
}

module.exports = { isValidProductName };
