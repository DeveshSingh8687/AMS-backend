const asyncHandler = require("express-async-handler");
const User = require("../models/User");

/**
 * Attaches a live `employeeCount` (how many employees this admin
 * currently manages) to each admin so the superadmin's screen can
 * show e.g. "37 / 50 employees".
 */
const withEmployeeCounts = async (admins) => {
  const counts = await User.aggregate([
    { $match: { role: "employee", createdBy: { $in: admins.map((a) => a._id) } } },
    { $group: { _id: "$createdBy", count: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.count]));

  return admins.map((admin) => {
    const obj = admin.toSafeObject ? admin.toSafeObject() : admin.toObject();
    obj.employeeCount = countMap.get(String(admin._id)) || 0;
    return obj;
  });
};

/**
 * @desc   List all admins, with employee count vs their limit
 * @route  GET /api/admins?search=
 * @access Private/Superadmin
 */
const getAdmins = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const filter = { role: "admin" };

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { employeeId: { $regex: search, $options: "i" } },
    ];
  }

  const admins = await User.find(filter).sort({ createdAt: -1 });
  const withCounts = await withEmployeeCounts(admins);

  res.status(200).json({ success: true, count: withCounts.length, admins: withCounts });
});

/**
 * @desc   Get single admin by id (with employee count)
 * @route  GET /api/admins/:id
 * @access Private/Superadmin
 */
const getAdminById = asyncHandler(async (req, res) => {
  const admin = await User.findOne({ _id: req.params.id, role: "admin" });
  if (!admin) {
    res.status(404);
    throw new Error("Admin not found");
  }
  const [withCount] = await withEmployeeCounts([admin]);
  res.status(200).json({ success: true, admin: withCount });
});

/**
 * @desc   Create a new admin account
 * @route  POST /api/admins
 * @access Private/Superadmin
 * @body   { name, employeeId, email, password, phone, department,
 *           designation, userLimit, activeUntil }
 */
const createAdmin = asyncHandler(async (req, res) => {
  const {
    name,
    employeeId,
    email,
    password,
    phone,
    department,
    designation,
    userLimit,
    activeUntil,
  } = req.body;

  if (!name || !employeeId || !email || !password) {
    res.status(400);
    throw new Error("Name, Employee ID, Email and Password are required");
  }

  const duplicateEmployeeId = await User.findOne({
    employeeId: employeeId.toUpperCase(),
  });
  if (duplicateEmployeeId) {
    res.status(400);
    throw new Error(`Employee ID '${employeeId}' is already in use`);
  }

  const duplicateEmail = await User.findOne({ email: email.toLowerCase() });
  if (duplicateEmail) {
    res.status(400);
    throw new Error(`Email '${email}' is already in use`);
  }

  const admin = await User.create({
    name,
    employeeId,
    email,
    password,
    phone,
    department,
    designation,
    role: "admin",
    status: "Active",
    createdBy: req.user._id,
    // Defaults to 20 if the superadmin doesn't specify a limit - change
    // any time later via PATCH /api/admins/:id/limit
    userLimit: userLimit !== undefined && userLimit !== null ? userLimit : 20,
    activeUntil: activeUntil || null,
  });

  res.status(201).json({
    success: true,
    message: "Admin created successfully",
    admin: admin.toSafeObject(),
  });
});

/**
 * @desc   Update an admin's details (name, phone, department, designation,
 *         userLimit, activeUntil, and optionally password). Email is
 *         intentionally not editable.
 * @route  PUT /api/admins/:id
 * @access Private/Superadmin
 */
const updateAdmin = asyncHandler(async (req, res) => {
  const admin = await User.findOne({ _id: req.params.id, role: "admin" });
  if (!admin) {
    res.status(404);
    throw new Error("Admin not found");
  }

  const {
    name,
    employeeId,
    phone,
    department,
    designation,
    userLimit,
    activeUntil,
    password,
  } = req.body;

  if (employeeId && employeeId.toUpperCase() !== admin.employeeId) {
    const duplicate = await User.findOne({
      employeeId: employeeId.toUpperCase(),
      _id: { $ne: admin._id },
    });
    if (duplicate) {
      res.status(400);
      throw new Error(`Employee ID '${employeeId}' is already in use`);
    }
    admin.employeeId = employeeId;
  }

  if (name !== undefined) admin.name = name;
  if (phone !== undefined) admin.phone = phone;
  if (department !== undefined) admin.department = department;
  if (designation !== undefined) admin.designation = designation;
  if (userLimit !== undefined) admin.userLimit = userLimit;
  if (activeUntil !== undefined) admin.activeUntil = activeUntil || null;
  if (password) admin.password = password; // pre-save hook hashes it

  await admin.save();

  res.status(200).json({
    success: true,
    message: "Admin updated successfully",
    admin: admin.toSafeObject(),
  });
});

/**
 * @desc   Delete an admin account. Employees they created are kept but
 *         unassigned (createdBy cleared) rather than deleted.
 * @route  DELETE /api/admins/:id
 * @access Private/Superadmin
 */
const deleteAdmin = asyncHandler(async (req, res) => {
  const admin = await User.findOne({ _id: req.params.id, role: "admin" });
  if (!admin) {
    res.status(404);
    throw new Error("Admin not found");
  }

  await User.updateMany(
    { createdBy: admin._id, role: "employee" },
    { $set: { createdBy: null } }
  );
  await admin.deleteOne();

  res.status(200).json({ success: true, message: "Admin deleted successfully" });
});

/**
 * @desc   Manually activate or deactivate an admin. Also used to
 *         reactivate an admin whose activeUntil date has passed -
 *         in that case pass a new future activeUntil (or omit it /
 *         send null to make the reactivation open-ended).
 * @route  PATCH /api/admins/:id/status
 * @access Private/Superadmin
 * @body   { status: "Active" | "Inactive", activeUntil?: "2026-08-01" | null }
 */
const setAdminStatus = asyncHandler(async (req, res) => {
  const { status, activeUntil } = req.body;

  if (!["Active", "Inactive"].includes(status)) {
    res.status(400);
    throw new Error("status must be 'Active' or 'Inactive'");
  }

  const admin = await User.findOne({ _id: req.params.id, role: "admin" });
  if (!admin) {
    res.status(404);
    throw new Error("Admin not found");
  }

  admin.status = status;

  // Reactivating: let the superadmin optionally set/refresh the expiry
  // date in the same request. If not provided, and the existing
  // activeUntil is already in the past, clear it so the expiry job
  // doesn't immediately deactivate them again.
  if (activeUntil !== undefined) {
    admin.activeUntil = activeUntil || null;
  } else if (
    status === "Active" &&
    admin.activeUntil &&
    new Date(admin.activeUntil) <= new Date()
  ) {
    admin.activeUntil = null;
  }

  await admin.save();

  res.status(200).json({
    success: true,
    message: `Admin ${status === "Active" ? "activated" : "deactivated"} successfully`,
    admin: admin.toSafeObject(),
  });
});

/**
 * @desc   Change how many employees an admin is allowed to have
 *         (e.g. 20 / 50 / 100). Pass null for unlimited.
 * @route  PATCH /api/admins/:id/limit
 * @access Private/Superadmin
 * @body   { userLimit: number | null }
 */
const setAdminUserLimit = asyncHandler(async (req, res) => {
  const { userLimit } = req.body;

  if (userLimit !== null && (typeof userLimit !== "number" || userLimit < 0)) {
    res.status(400);
    throw new Error("userLimit must be a non-negative number or null (unlimited)");
  }

  const admin = await User.findOne({ _id: req.params.id, role: "admin" });
  if (!admin) {
    res.status(404);
    throw new Error("Admin not found");
  }

  admin.userLimit = userLimit;
  await admin.save();

  res.status(200).json({
    success: true,
    message: `Employee limit updated to ${userLimit === null ? "unlimited" : userLimit}`,
    admin: admin.toSafeObject(),
  });
});

module.exports = {
  getAdmins,
  getAdminById,
  createAdmin,
  updateAdmin,
  deleteAdmin,
  setAdminStatus,
  setAdminUserLimit,
};
