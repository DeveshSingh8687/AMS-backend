const asyncHandler = require("express-async-handler");
const { Parser } = require("json2csv");
const PDFDocument = require("pdfkit");
const Attendance = require("../models/Attendance");
const User = require("../models/User");
const { getTodayDateString, hoursBetween } = require("../utils/dateHelpers");
const reverseGeocode = require("../utils/geocode");

const RELOGIN_BLOCK_HOURS = Number(process.env.RELOGIN_BLOCK_HOURS || 12);

/**
 * @desc   Punch in. Creates a new attendance session for today.
 *         Rules (mirroring the frontend's canPunchIn logic exactly):
 *           - No record yet today -> allowed.
 *           - Most recent record today is "punched_in" (still open) ->
 *             blocked unless 12h+ have passed since that punch-in, in
 *             which case the stale session is auto-closed first.
 *           - Most recent record today is "present" (a completed
 *             session) -> blocked from starting a new one unless 12h+
 *             have passed since that punch-in.
 * @route  POST /api/attendance/punch-in
 * @access Private
 * @body   { latitude, longitude }
 */
const punchIn = asyncHandler(async (req, res) => {
  const { latitude, longitude } = req.body;
  const user = req.user;
  const today = getTodayDateString();
  const now = new Date();

  const latest = await Attendance.findOne({ employee: user._id, date: today }).sort({
    "punchIn.time": -1,
  });

  if (latest) {
    const hoursSincePunchIn = hoursBetween(now, latest.punchIn.time);

    if (latest.status === "punched_in") {
      if (hoursSincePunchIn < RELOGIN_BLOCK_HOURS) {
        res.status(409);
        throw new Error(
          `Already punched in. Please punch out first, or try again in ${(
            RELOGIN_BLOCK_HOURS - hoursSincePunchIn
          ).toFixed(1)}h.`
        );
      }
      // Stale open session (12h+) - auto-close it before starting a new one
      latest.punchOut = { time: now, location: latest.punchIn.location };
      latest.hours = Number(hoursBetween(now, latest.punchIn.time).toFixed(2));
      latest.status = "present";
      latest.autoLogout = true;
      await latest.save();
    } else if (latest.status === "present") {
      if (hoursSincePunchIn < RELOGIN_BLOCK_HOURS) {
        res.status(409);
        throw new Error(
          `Attendance complete for this session. You can punch in again in ${(
            RELOGIN_BLOCK_HOURS - hoursSincePunchIn
          ).toFixed(1)}h.`
        );
      }
    }
  }

  const address =
    latitude !== undefined && longitude !== undefined
      ? await reverseGeocode(latitude, longitude)
      : "";

  const record = await Attendance.create({
    employee: user._id,
    employeeId: user.employeeId,
    employeeName: user.name,
    department: user.department || "",
    date: today,
    punchIn: {
      time: now,
      location:
        latitude !== undefined && longitude !== undefined
          ? { latitude, longitude, address }
          : null,
    },
    status: "punched_in",
  });

  res.status(201).json({ success: true, message: "Punched in", record });
});

/**
 * @desc   Punch out. Closes the employee's currently open session.
 * @route  POST /api/attendance/punch-out
 * @access Private
 * @body   { latitude, longitude }
 */
const punchOut = asyncHandler(async (req, res) => {
  const { latitude, longitude } = req.body;
  const user = req.user;

  const open = await Attendance.findOne({
    employee: user._id,
    status: "punched_in",
  }).sort({ "punchIn.time": -1 });

  if (!open) {
    res.status(400);
    throw new Error("You are not currently punched in");
  }

  const now = new Date();
  const address =
    latitude !== undefined && longitude !== undefined
      ? await reverseGeocode(latitude, longitude)
      : "";

  open.punchOut = {
    time: now,
    location:
      latitude !== undefined && longitude !== undefined
        ? { latitude, longitude, address }
        : null,
  };
  open.hours = Number(hoursBetween(now, open.punchIn.time).toFixed(2));
  open.status = "present";
  await open.save();

  res.status(200).json({ success: true, message: "Punched out", record: open });
});

/**
 * Shared query builder for the Attendance Management screen filters.
 * Scopes results to the requester: an "admin" only ever sees
 * attendance for employees they created; a "superadmin" sees everyone.
 */
const buildFilter = async (query, reqUser) => {
  const { search, employee, status, from, to } = query;
  const filter = {};

  if (reqUser.role === "admin") {
    const employeeIds = await User.find({
      role: "employee",
      createdBy: reqUser._id,
    }).distinct("_id");
    const allowedIds = employeeIds.map((id) => String(id));

    if (employee && employee !== "all" && employee !== "All") {
      filter.employee = allowedIds.includes(String(employee)) ? employee : null;
    } else {
      filter.employee = { $in: employeeIds };
    }
  } else if (employee && employee !== "all" && employee !== "All") {
    filter.employee = employee;
  }

  if (status && status !== "All") filter.status = status;

  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = from;
    if (to) filter.date.$lte = to;
  }

  if (search) {
    filter.$or = [
      { employeeName: { $regex: search, $options: "i" } },
      { employeeId: { $regex: search, $options: "i" } },
    ];
  }

  return filter;
};

/**
 * @desc   Get all attendance records (Attendance Management table)
 * @route  GET /api/attendance?search=&employee=&status=&from=&to=&page=&limit=
 * @access Private/Admin
 */
const getAllAttendance = asyncHandler(async (req, res) => {
  const filter = await buildFilter(req.query, req.user);
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 500;

  const [records, total] = await Promise.all([
    Attendance.find(filter)
      .sort({ date: -1, "punchIn.time": -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Attendance.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    count: records.length,
    total,
    page,
    pages: Math.ceil(total / limit),
    records,
  });
});

/**
 * @desc   Get one attendance record's full detail (Attendance Detail screen)
 * @route  GET /api/attendance/:id
 * @access Private
 */
const getAttendanceById = asyncHandler(async (req, res) => {
  const record = await Attendance.findById(req.params.id).populate(
    "employee",
    "name employeeId department designation email createdBy"
  );

  if (!record) {
    res.status(404);
    throw new Error("Attendance record not found");
  }

  if (
    req.user.role === "admin" &&
    String(record.employee?.createdBy) !== String(req.user._id)
  ) {
    res.status(403);
    throw new Error("You do not have access to this record");
  }

  if (
    req.user.role === "employee" &&
    String(record.employee?._id) !== String(req.user._id)
  ) {
    res.status(403);
    throw new Error("You do not have access to this record");
  }

  res.status(200).json({ success: true, record });
});

/**
 * @desc   Logged-in employee's own attendance history
 * @route  GET /api/attendance/my-history?from=&to=&page=&limit=
 * @access Private
 */
const getMyAttendance = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 200;

  const filter = { employee: req.user._id };
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = from;
    if (to) filter.date.$lte = to;
  }

  const [records, total] = await Promise.all([
    Attendance.find(filter)
      .sort({ date: -1, "punchIn.time": -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Attendance.countDocuments(filter),
  ]);

  res.status(200).json({
    success: true,
    count: records.length,
    total,
    page,
    pages: Math.ceil(total / limit),
    records,
  });
});

/**
 * @desc   Export filtered attendance as CSV
 * @route  GET /api/attendance/export/csv
 * @access Private/Admin
 */
const exportCSV = asyncHandler(async (req, res) => {
  const filter = await buildFilter(req.query, req.user);
  const records = await Attendance.find(filter).sort({ date: -1 }).lean();

  const rows = records.map((r) => ({
    Employee: r.employeeName,
    ID: r.employeeId,
    Date: r.date,
    "Punch In": r.punchIn?.time ? new Date(r.punchIn.time).toLocaleTimeString() : "",
    "In Location": r.punchIn?.location?.address || "",
    "Punch Out": r.punchOut?.time ? new Date(r.punchOut.time).toLocaleTimeString() : "",
    "Out Location": r.punchOut?.location?.address || "",
    Hours: r.hours ?? "",
    Status: r.status,
  }));

  const parser = new Parser();
  const csv = parser.parse(rows);

  res.header("Content-Type", "text/csv");
  res.attachment(`attendance-${Date.now()}.csv`);
  res.send(csv);
});

/**
 * @desc   Export filtered attendance as PDF
 * @route  GET /api/attendance/export/pdf
 * @access Private/Admin
 */
const exportPDF = asyncHandler(async (req, res) => {
  const filter = await buildFilter(req.query, req.user);
  const records = await Attendance.find(filter).sort({ date: -1 }).lean();

  const doc = new PDFDocument({ margin: 30, size: "A4", layout: "landscape" });
  res.header("Content-Type", "application/pdf");
  res.attachment(`attendance-${Date.now()}.pdf`);
  doc.pipe(res);

  doc.fontSize(18).text("Attendance Report", { align: "center" });
  doc.moveDown();

  const headers = ["Employee", "ID", "Date", "Punch In", "Punch Out", "Hours", "Status"];
  const colWidths = [140, 70, 80, 90, 90, 60, 70];
  let y = doc.y;

  doc.fontSize(10).font("Helvetica-Bold");
  headers.forEach((h, i) => {
    const x = 30 + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
    doc.text(h, x, y, { width: colWidths[i] });
  });

  doc.font("Helvetica");
  y += 20;

  records.forEach((r) => {
    if (y > 550) {
      doc.addPage();
      y = 30;
    }
    const rowValues = [
      r.employeeName,
      r.employeeId,
      r.date,
      r.punchIn?.time ? new Date(r.punchIn.time).toLocaleTimeString() : "-",
      r.punchOut?.time ? new Date(r.punchOut.time).toLocaleTimeString() : "-",
      r.hours != null ? String(r.hours) : "-",
      r.status,
    ];
    rowValues.forEach((val, i) => {
      const x = 30 + colWidths.slice(0, i).reduce((a, b) => a + b, 0);
      doc.text(val, x, y, { width: colWidths[i] });
    });
    y += 20;
  });

  doc.end();
});

module.exports = {
  punchIn,
  punchOut,
  getAllAttendance,
  getAttendanceById,
  getMyAttendance,
  exportCSV,
  exportPDF,
};
