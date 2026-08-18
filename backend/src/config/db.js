const mongoose = require("mongoose");

async function connectDb() {
  const uri = process.env.MONGO_URI;

  if (!uri || uri === "memory") {
    throw new Error(
      "Set MONGO_URI in backend/.env to your MongoDB Atlas connection string."
    );
  }

  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
  console.log("MongoDB connected");
}

module.exports = { connectDb };
