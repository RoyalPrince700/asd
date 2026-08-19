const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
require("../config/env");
const User = require("../models/User");
const StockRecord = require("../models/StockRecord");
const Product = require("../models/Product");
const { COMPANIES } = require("../constants/companies");
const { computeClosingBalance } = require("./stock");
const { connectDb } = require("../config/db");

const products = [];

function daysAgo(n) {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

async function bootstrapAdmin() {
  const adminExists = await User.exists({ role: "admin" });
  if (adminExists) {
    return { created: false };
  }

  const email = String(process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  const password = String(process.env.ADMIN_PASSWORD || "");
  const name = String(process.env.ADMIN_NAME || "System Admin").trim();

  if (!email || !password) {
    console.log(
      "No admin account found. Sign up at /signup or set ADMIN_EMAIL and ADMIN_PASSWORD in .env."
    );
    return { created: false };
  }

  const hash = await bcrypt.hash(password, 10);
  const existing = await User.findOne({ email });

  if (existing) {
    existing.role = "admin";
    existing.password = hash;
    if (name) existing.name = name;
    await existing.save();
    return { created: true, email, upgraded: true };
  }

  await User.create({ name, email, password: hash, role: "admin" });
  return { created: true, email };
}

async function seedDatabase({ reset = false } = {}) {
  if (reset) {
    await User.deleteMany({});
    await StockRecord.deleteMany({});
    await Product.deleteMany({});
  } else if (await User.exists({})) {
    return { seeded: false };
  }

  const password = await bcrypt.hash("password123", 10);

  const [, clerk] = await User.create([
    {
      name: "System Admin",
      email: "admin@company.com",
      password,
      role: "admin",
    },
    {
      name: "James Adeyemi",
      email: "clerk@company.com",
      password,
      role: "clerk",
    },
  ]);

  await Product.insertMany(products.map((name) => ({ name })));

  if (!products.length) {
    return { seeded: true, records: 0 };
  }

  const rows = [];
  const openings = Object.fromEntries(products.map((name) => [name, 0]));

  for (let i = 21; i >= 0; i -= 3) {
    for (const product of products) {
      const opening = openings[product];
      const inbound = Math.floor(Math.random() * 18);
      const outbound = Math.floor(Math.random() * 10);
      const closing = computeClosingBalance({
        openingBalance: opening,
        inbound,
        outbound,
        stockReceived: 0,
        stockOut: 0,
      });

      if (closing < 0) continue;

      rows.push({
        productName: product,
        date: daysAgo(i),
        openingBalance: opening,
        inbound,
        outbound,
        stockReceived: 0,
        stockOut: 0,
        closingBalance: closing,
        enteredBy: clerk._id,
      });

      openings[product] = closing;
    }
  }

  await StockRecord.insertMany(rows);
  return { seeded: true, records: rows.length };
}

async function runCli() {
  await connectDb();
  const result = await seedDatabase({ reset: true });
  console.log("Seed complete");
  console.log("Admin  admin@company.com / password123");
  console.log("Clerk  clerk@company.com / password123");
  console.log(`Records: ${result.records}`);
  await mongoose.disconnect();
}

if (require.main === module) {
  runCli().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

async function bootstrapProducts() {
  const count = await Product.countDocuments();
  if (count > 0) {
    return { bootstrapped: false, count };
  }

  const names = await StockRecord.distinct("productName");
  if (!names.length) {
    return { bootstrapped: false, count: 0 };
  }

  await Product.insertMany(
    names.map((name) => ({ name, company: COMPANIES.ACCESSIBLE }))
  );
  return { bootstrapped: true, count: names.length };
}

module.exports = { seedDatabase, bootstrapAdmin, bootstrapProducts };
