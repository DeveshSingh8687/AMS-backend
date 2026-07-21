const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");
const User = require("../models/User");

/**
 * Verifies the Bearer token sent in the Authorization header
 * and attaches the logged-in user (without password) to req.user
 */
const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    res.status(401);
    throw new Error("Not authorized, no token provided");
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user) {
      res.status(401);
      throw new Error("Not authorized, user no longer exists");
    }

    if (user.status === "Inactive") {
      res.status(403);
      throw new Error("Your account has been deactivated. Contact admin.");
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401);
    throw new Error("Not authorized, invalid or expired token");
  }
});

/**
 * Generic role gate. Use AFTER `protect`.
 * e.g. restrictTo("superadmin"), restrictTo("admin", "superadmin")
 */
const restrictTo = (...roles) => (req, res, next) => {
  if (req.user && roles.includes(req.user.role)) {
    return next();
  }
  res.status(403);
  throw new Error("Access denied. You do not have permission to do this.");
};

// Admin-level screens (dashboard, user management, attendance) are
// accessible to both "admin" and "superadmin" - superadmin can do
// everything an admin can, plus manage admins themselves.
const adminOnly = restrictTo("admin", "superadmin");

// Admin management (create/update/delete admins, set limits & expiry)
// is superadmin-only.
const superAdminOnly = restrictTo("superadmin");

module.exports = { protect, adminOnly, superAdminOnly, restrictTo };
