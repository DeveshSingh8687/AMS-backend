require("dotenv").config();
const app = require("./src/app");
const connectDB = require("./src/config/db");
const startAutoLogoutJob = require("./src/jobs/autoLogoutJob");
const startAdminExpiryJob = require("./src/jobs/adminExpiryJob");

const PORT = process.env.PORT || 5000;

const start = async () => {
  await connectDB();
  startAutoLogoutJob();
  startAdminExpiryJob();

  app.listen(PORT, () => {
    console.log(`AttendEase API running on http://localhost:${PORT}`);
  });
};

start();

// Safety net: log (don't crash silently on) unexpected promise rejections
process.on("unhandledRejection", (err) => {
  console.error(`Unhandled Rejection: ${err.message}`);
});
