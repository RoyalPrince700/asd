const path = require("path");
require("dotenv").config({
  path: path.join(__dirname, "../.env"),
  override: true,
});
const express = require("express");
const cors = require("cors");
const { connectDb } = require("./config/db");
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const recordRoutes = require("./routes/records");
const recordChangeRoutes = require("./routes/recordChanges");
const productRoutes = require("./routes/products");
const categoryRoutes = require("./routes/categories");
const staffRoutes = require("./routes/staff");
const reportRoutes = require("./routes/reports");
const analysisRoutes = require("./routes/analysis");
const { bootstrapAdmin, bootstrapProducts } = require("./utils/seed");

const app = express();
const port = Number(process.env.PORT) || 5000;
const host = process.env.HOST || "0.0.0.0";
const allowedOrigins = String(process.env.CLIENT_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (!allowedOrigins.length) {
  throw new Error(
    "Set CLIENT_ORIGIN in the environment to your frontend URL (comma-separated if you have more than one)."
  );
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/records", recordRoutes);
app.use("/api/record-changes", recordChangeRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/analysis", analysisRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: err.message || "Server error" });
});

connectDb()
  .then(async () => {
    const result = await bootstrapAdmin();
    if (result.created) {
      console.log(`Bootstrap admin created: ${result.email}`);
    }
    const products = await bootstrapProducts();
    if (products.bootstrapped) {
      console.log(`Product catalog bootstrapped with ${products.count} items`);
    }
    app.listen(port, host, () => {
      console.log(`API listening on ${host}:${port}`);
    });
  })
  .catch((err) => {
    console.error("Failed to start server", err);
    process.exit(1);
  });
