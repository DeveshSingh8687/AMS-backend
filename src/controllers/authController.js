const asyncHandler = require("express-async-handler");
const User = require("../models/User");
const generateToken = require("../utils/generateToken");

/**
 * @desc   Login. This is plain authentication only - it does NOT punch
 *         the employee in. Punching in/out is a separate action from
 *         the dashboard (see attendanceController.punchIn/punchOut).
 * @route  POST /api/auth/login
 * @access Public
 * @body   { email, password }
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400);
    throw new Error("Email and password are required");
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select(
    "+password"
  );

  if (!user || !(await user.comparePassword(password))) {
    res.status(401);
    throw new Error("Invalid email or password");
  }

  if (user.status === "Inactive") {
    res.status(403);
    throw new Error(
      user.role === "admin"
        ? "Your admin account is inactive. Contact the superadmin."
        : "Your account has been deactivated. Contact admin."
    );
  }

  // Employees can be individually locked out of login by an admin,
  // independent of punching in/out.
  if (user.role === "employee" && !user.loginEnable) {
    res.status(403);
    throw new Error("Login is disabled for your account. Contact admin.");
  }

  user.isLoggedIn = true;
  user.lastLoginTime = new Date();
  await user.save();

  const token = generateToken(user._id, user.role);

  res.status(200).json({
    success: true,
    message: "Login successful",
    token,
    user: user.toSafeObject(),
  });
});

/**
 * @desc   Logout (session only - does not punch the employee out;
 *         use the Punch Out button for that).
 * @route  POST /api/auth/logout
 * @access Private
 */
const logout = asyncHandler(async (req, res) => {
  const user = req.user;
  user.isLoggedIn = false;
  user.lastLogoutTime = new Date();
  await user.save();

  res.status(200).json({ success: true, message: "Logout successful" });
});

/**
 * @desc   Get currently logged in user's profile
 * @route  GET /api/auth/me
 * @access Private
 */
const getMe = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, user: req.user.toSafeObject() });
});

/**
 * @desc   Change password (self-service). Email cannot be changed here.
 * @route  PUT /api/auth/change-password
 * @access Private
 * @body   { currentPassword, newPassword }
 */
const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    res.status(400);
    throw new Error("Current password and new password are required");
  }

  if (newPassword.length < 6) {
    res.status(400);
    throw new Error("New password must be at least 6 characters");
  }

  const user = await User.findById(req.user._id).select("+password");

  if (!(await user.comparePassword(currentPassword))) {
    res.status(401);
    throw new Error("Current password is incorrect");
  }

  user.password = newPassword; // pre-save hook hashes it
  await user.save();

  res.status(200).json({ success: true, message: "Password updated successfully" });
});

module.exports = { login, logout, getMe, changePassword };
