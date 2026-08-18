const Category = require("../models/Category");

async function isValidCategory(name) {
  if (!name) return false;
  const exists = await Category.exists({ name: String(name).trim() });
  return Boolean(exists);
}

module.exports = { isValidCategory };
