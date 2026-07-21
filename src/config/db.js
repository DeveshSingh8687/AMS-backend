const mongoose = require("mongoose");

/**
 * Connects to MongoDB using the connection string in .env (MONGO_URI).
 * Called once when the server starts (see server.js).
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
