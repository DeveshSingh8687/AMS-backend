const asyncHandler = require("express-async-handler");
const User = require("../models/User");
const Attendance = require("../models/Attendance");

/**
 * This controller manages EMPLOYEE accounts only (role: "employee").
 * Admin accounts are managed separately by the superadmin via
 * adminController.js / /api/admins.
 *
 * Scoping rule: an "admin" only ever sees/edits employees they created
 * (createdBy === admin._id). A "superadmin" can see/edit any employee,
 * across all admins - useful for oversight, though day-to-day employee
 * management is expected to happen at the admin level.
 */

// Builds the base filter that scopes every query to the right employees
const scopeFilter = (req) => {
  const filter = { role: "employee" };
  if (req.user.role === "admin") {
    filter.createdBy = req.user._id;
  }
  return filter;
};

/**
 * @desc   Get all employees visible to the requester
 * @route  GET /api/users?search=john
 * @access Private/Admin, Private/Superadmin
 */
const getUsers = asyncHandler(async (req, res) => {
  const { search } = req.query;
  const filter = scopeFilter(req);

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { employeeId: { $regex: search, $options: "i" } },
      { department: { $regex: search, $options: "i" } },
    ];
  }

  const users = await User.find(filter).sort({ createdAt: -1 });
  res.status(200).json({ success: true, count: users.length, users });
});

/**
 * @desc   Get single employee by id (must belong to this admin, unless superadmin)
 * @route  GET /api/users/:id
 * @access Private/Admin, Private/Superadmin
 */
const getUserById = asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, ...scopeFilter(req) });
  if (!user) {
    res.status(404);
    throw new Error("Employee not found");
  }
  res.status(200).json({ success: true, user });
});

/**
 * @desc   Create a new employee (Add Employee form). If the requester
 *         is an admin, this counts against their userLimit.
 * @route  POST /api/users
 * @access Private/Admin, Private/Superadmin
 * @body   { name, employeeId, email, phone, department, designation, status, password }
 */
const createUser = asyncHandler(async (req, res) => {
  const { name, employeeId, email, phone, department, designation, status, password } =
    req.body;

  if (!name || !employeeId || !email) {
    res.status(400);
    throw new Error("Name, Employee ID and Email are required");
  }

  // Enforce the admin's employee limit (superadmin is not limited)
  if (
    req.user.role === "admin" &&
    req.user.userLimit !== null &&
    req.user.userLimit !== undefined
  ) {
    const currentCount = await User.countDocuments({
      role: "employee",
      createdBy: req.user._id,
    });
    if (currentCount >= req.user.userLimit) {
      res.status(403);
      throw new Error(
        `Employee limit reached. You can manage up to ${req.user.userLimit} employee(s). Ask the superadmin to increase your limit.`
      );
    }
  }

  const existingEmployeeId = await User.findOne({
    employeeId: employeeId.toUpperCase(),
  });
  if (existingEmployeeId) {
    res.status(400);
    throw new Error(`Employee ID '${employeeId}' is already in use`);
  }

  const existingEmail = await User.findOne({ email: email.toLowerCase() });
  if (existingEmail) {
    res.status(400);
    throw new Error(`Email '${email}' is already in use`);
  }

  // Default password when admin doesn't set one - employee changes it later
  const tempPassword = password || `${employeeId}@123`;

  const user = await User.create({
    name,
    employeeId,
    email,
    phone,
    department,
    designation,
    status: status || "Active",
    role: "employee",
    createdBy: req.user._id,
    password: tempPassword,
  });

  res.status(201).json({
    success: true,
    message: "Employee added successfully",
    user: user.toSafeObject(),
    temporaryPassword: password ? undefined : tempPassword,
  });
});

/**
 * @desc   Update an employee's details
 * @route  PUT /api/users/:id
 * @access Private/Admin, Private/Superadmin
 */
const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, ...scopeFilter(req) });
  if (!user) {
    res.status(404);
    throw new Error("Employee not found");
  }

  const { name, employeeId, phone, department, designation, status } = req.body;
  // Note: email is intentionally NOT editable, matching the spec.

  if (employeeId && employeeId.toUpperCase() !== user.employeeId) {
    const duplicate = await User.findOne({
      employeeId: employeeId.toUpperCase(),
      _id: { $ne: user._id },
    });
    if (duplicate) {
      res.status(400);
      throw new Error(`Employee ID '${employeeId}' is already in use`);
    }
    user.employeeId = employeeId;
  }

  if (name !== undefined) user.name = name;
  if (phone !== undefined) user.phone = phone;
  if (department !== undefined) user.department = department;
  if (designation !== undefined) user.designation = designation;
  if (status !== undefined) user.status = status;

  await user.save();

  res.status(200).json({
    success: true,
    message: "Employee updated successfully",
    user: user.toSafeObject(),
  });
});

/**
 * @desc   Delete an employee
 * @route  DELETE /api/users/:id
 * @access Private/Admin, Private/Superadmin
 */
const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, ...scopeFilter(req) });
  if (!user) {
    res.status(404);
    throw new Error("Employee not found");
  }

  await user.deleteOne();
  // Attendance history is kept for record-keeping; remove the next
  // line's comment if you'd rather cascade-delete it instead:
  // await Attendance.deleteMany({ employee: user._id });

  res.status(200).json({ success: true, message: "Employee deleted successfully" });
});

/**
 * @desc   Toggle whether an employee is allowed to log in (the toggle
 *         icon next to each row in User Management)
 * @route  PATCH /api/users/:id/toggle-login
 * @access Private/Admin, Private/Superadmin
 */
const toggleLoginEnable = asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, ...scopeFilter(req) });
  if (!user) {
    res.status(404);
    throw new Error("Employee not found");
  }

  user.loginEnable = !user.loginEnable;
  await user.save();

  res.status(200).json({
    success: true,
    message: `Login ${user.loginEnable ? "enabled" : "disabled"} for ${user.name}`,
    loginEnable: user.loginEnable,
  });
});

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  toggleLoginEnable,
};
