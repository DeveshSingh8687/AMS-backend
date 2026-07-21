const express = require("express");
const {
  punchIn,
  punchOut,
  getAllAttendance,
  getAttendanceById,
  getMyAttendance,
  exportCSV,
  exportPDF,
} = require("../controllers/attendanceController");
const { protect, adminOnly } = require("../middlewares/authMiddleware");

const router = express.Router();

// Employee: punch in / out, view own history
router.post("/punch-in", protect, punchIn);
router.post("/punch-out", protect, punchOut);
router.get("/my-history", protect, getMyAttendance);

// Admin: full attendance management
router.get("/", protect, adminOnly, getAllAttendance);
router.get("/export/csv", protect, adminOnly, exportCSV);
router.get("/export/pdf", protect, adminOnly, exportPDF);
// (not adminOnly - controller itself allows an employee to view their own record)
router.get("/:id", protect, getAttendanceById);

module.exports = router;
