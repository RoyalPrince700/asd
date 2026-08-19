const mongoose = require("mongoose");
const { mongoUri } = require("./env");

async function connectDb() {
  mongoose.set("strictQuery", true);
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 20000 });
  console.log("MongoDB connected");
}

module.exports = { connectDb };
