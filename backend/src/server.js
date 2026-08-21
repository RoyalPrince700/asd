const express = require("express");
const cors = require("cors");
const { port, host, allowedOrigins } = require("./config/env");
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
const requestRoutes = require("./routes/requests");
const { bootstrapAdmin, bootstrapProducts } = require("./utils/seed");
const { backfillStockIds } = require("./utils/stockId");
const { backfillRequestIds } = require("./utils/requestId");

const app = express();

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
app.use("/api/requests", requestRoutes);

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
    const stockIds = await backfillStockIds();
    if (stockIds.assigned) {
      console.log(`Assigned stock IDs to ${stockIds.assigned} existing transactions`);
    }
    const requestIds = await backfillRequestIds();
    if (requestIds.assigned) {
      console.log(`Assigned request IDs to ${requestIds.assigned} existing requests`);
    }
    const server = app.listen(port, host, () => {
      console.log(`API listening on ${host}:${port}`);
      console.log(`Health check: http://127.0.0.1:${port}/api/health`);
    });
    server.on("error", (err) => {
      console.error("[server] failed to bind", {
        host,
        port,
        code: err.code,
        message: err.message,
      });
    });
  })
  .catch((err) => {
    console.error("Failed to start server", err);
    process.exit(1);
  });
