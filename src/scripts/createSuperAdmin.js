/**
 * One-time helper to create your first SUPERADMIN account - the
 * top-level role that creates and manages admins.
 * Run with:  npm run seed:superadmin
 *
 * Reads SUPERADMIN_NAME / SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD /
 * SUPERADMIN_EMPLOYEE_ID from your .env file. Change these before
 * running if you like.
 *
 * After this, log in as the superadmin and create admins from
 * POST /api/admins (or your future admin UI). Each admin then creates
 * their own employees from POST /api/users.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const connectDB = require("../config/db");
const User = require("../models/User");

const run = async () => {
  await connectDB();

  const email = (
    process.env.SUPERADMIN_EMAIL || "superadmin@attendease.com"
  ).toLowerCase();

  const existing = await User.findOne({ email });
  if (existing) {
    console.log(`Superadmin with email ${email} already exists. Nothing to do.`);
    await mongoose.disconnect();
    return;
  }

  const superadmin = await User.create({
    name: process.env.SUPERADMIN_NAME || "Super Admin",
    email,
    password: process.env.SUPERADMIN_PASSWORD || "SuperAdmin@12345",
    employeeId: process.env.SUPERADMIN_EMPLOYEE_ID || "SA0001",
    role: "superadmin",
    status: "Active",
    department: "Administration",
    designation: "Super Administrator",
  });

  console.log("Superadmin account created:");
  console.log(`  Email:    ${superadmin.email}`);
  console.log(`  Password: ${process.env.SUPERADMIN_PASSWORD || "SuperAdmin@12345"}`);
  console.log("  (change this password after first login)");

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
