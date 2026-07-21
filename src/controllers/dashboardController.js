const asyncHandler = require("express-async-handler");
const User = require("../models/User");
const Attendance = require("../models/Attendance");
const { getTodayDateString } = require("../utils/dateHelpers");

/**
 * @desc   Dashboard summary cards + today's attendance table.
 *         Mirrors AdminDashboard.jsx's stat calculation exactly:
 *           presentToday = todayAttendance where status is "present" or "punched_in"
 *           activeNow    = todayAttendance where status is "punched_in"
 *           yetToPunch   = totalEmployees - todayAttendance.length
 *           totalAttendance = todayAttendance.length
 *         An "admin" only sees stats for employees they created.
 *         A "superadmin" sees stats across the whole system.
 * @route  GET /api/dashboard
 * @access Private/Admin, Private/Superadmin
 */
const getDashboardStats = asyncHandler(async (req, res) => {
  const today = getTodayDateString();

  const employeeFilter = { role: "employee", status: "Active" };
  if (req.user.role === "admin") {
    employeeFilter.createdBy = req.user._id;
  }

  const employeeIds = await User.find(employeeFilter).distinct("_id");
  const todaysAttendance = await Attendance.find({
    date: today,
    employee: { $in: employeeIds },
  }).sort({ "punchIn.time": -1 });

  const present = todaysAttendance.filter((a) => a.status === "present").length;
  const active = todaysAttendance.filter((a) => a.status === "punched_in").length;

  res.status(200).json({
    success: true,
    date: today,
    stats: {
      totalEmployees: employeeIds.length,
      presentToday: present + active,
      activeNow: active,
      yetToPunch: Math.max(employeeIds.length - todaysAttendance.length, 0),
      totalAttendance: todaysAttendance.length,
    },
    todaysAttendance: todaysAttendance.slice(0, 10),
  });
});

module.exports = { getDashboardStats };
