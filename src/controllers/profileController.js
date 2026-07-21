const asyncHandler = require("express-async-handler");
const User = require("../models/User");

/**
 * @desc   Get my own profile
 * @route  GET /api/profile
 * @access Private
 */
const getProfile = asyncHandler(async (req, res) => {
  res.status(200).json({ success: true, user: req.user.toSafeObject() });
});

/**
 * @desc   Update my own profile. Email is NOT editable here by design.
 *         Password changes go through /api/auth/change-password.
 * @route  PUT /api/profile
 * @access Private
 * @body   { name, phone, department, designation }
 */
const updateProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  const { name, phone, department, designation } = req.body;

  if (name !== undefined) user.name = name;
  if (phone !== undefined) user.phone = phone;
  // Employees typically shouldn't change their own department/designation,
  // but admins editing their own profile may want to. Allow both here;
  // lock this down further in the frontend if needed.
  if (department !== undefined) user.department = department;
  if (designation !== undefined) user.designation = designation;

  await user.save();

  res.status(200).json({
    success: true,
    message: "Profile updated successfully",
    user: user.toSafeObject(),
  });
});

module.exports = { getProfile, updateProfile };
