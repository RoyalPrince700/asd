const Product = require("../models/Product");
const { COMPANIES } = require("../constants/companies");

async function isValidProductName(name, company) {
  if (!name) return false;
  const filter = { name: String(name).trim() };
  if (company) {
    filter.company = company;
  }
  const exists = await Product.exists(filter);
  return Boolean(exists);
}

module.exports = { isValidProductName };
