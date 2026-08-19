const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, "../../.env"),
  override: true,
});

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const port = Number(process.env.PORT);
if (!Number.isFinite(port) || port <= 0) {
  throw new Error("Set PORT in the environment.");
}

const host = String(process.env.HOST || "0.0.0.0").trim();
const mongoUri = required("MONGO_URI");
const jwtSecret = required("JWT_SECRET");
const allowedOrigins = required("CLIENT_ORIGIN")
  .split(",")
  .map((origin) => origin.trim().replace(/\/$/, ""))
  .filter(Boolean);

if (!allowedOrigins.length) {
  throw new Error(
    "CLIENT_ORIGIN must contain at least one frontend origin."
  );
}

module.exports = {
  port,
  host,
  mongoUri,
  jwtSecret,
  allowedOrigins,
};
