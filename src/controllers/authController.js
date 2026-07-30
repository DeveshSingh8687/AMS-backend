const asyncHandler = require("express-async-handler");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { generateAccessToken, generateRefreshToken } = require("../utils/generateToken");
const hashToken = require("../utils/hashToken");

const REFRESH_COOKIE_NAME = "refreshToken";

/**
 * Cookie options for the refresh token. httpOnly means client-side JS
 * (including an XSS payload) can never read it - only the browser
 * sends it automatically, only to /api/auth/* (see `path` below).
 *
 * sameSite/secure differ by environment: in production (real HTTPS,
 * likely cross-site frontend/backend) you need sameSite:"none" +
 * secure:true. In local dev over plain http, "none" is rejected by
 * browsers unless secure - so we use "lax" there instead.
 */
const cookieOptions = (maxAgeMs) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  path: "/api/auth",
  maxAge: maxAgeMs,
});

/**
 * Signs an access + refresh token pair, stores the refresh token's
 * hash on the user (for revocation/rotation), sets it as an httpOnly
 * cookie on the response, and returns only the access token - the
 * refresh token itself never appears in any JSON response body.
 */
const issueTokenPair = async (user, res) => {
  const accessToken = generateAccessToken(user._id, user.role);
  const refreshToken = generateRefreshToken(user._id, user.role);

  const { exp } = jwt.decode(refreshToken);
  const expiresAt = new Date(exp * 1000);

  user.refreshTokenHash = hashToken(refreshToken);
  user.refreshTokenExpires = expiresAt;
  await user.save();

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, cookieOptions(expiresAt.getTime() - Date.now()));

  return accessToken;
};

/**
 * @desc   Login. Plain authentication only - does NOT punch the
 *         employee in (see attendanceController.punchIn/punchOut).
 *         Sets the refresh token as an httpOnly cookie; the response
 *         body only ever contains the short-lived access token.
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

  const accessToken = await issueTokenPair(user, res);

  res.status(200).json({
    success: true,
    message: "Login successful",
    token: accessToken,
    user: user.toSafeObject(),
  });
});

/**
 * @desc   Exchange the refresh token (read from the httpOnly cookie)
 *         for a new access token, rotating the refresh cookie too.
 *         Call this when a protected request comes back 401 because
 *         the access token expired - no need to log in again until
 *         the refresh token itself expires (JWT_REFRESH_EXPIRES_IN,
 *         default 30 days) or the user logs out.
 * @route  POST /api/auth/refresh
 * @access Public (the refresh cookie itself is the credential)
 */
const refreshToken = asyncHandler(async (req, res) => {
  // Cookie is the primary path (browsers). req.body.refreshToken is
  // accepted as a fallback for non-browser API consumers (mobile apps,
  // server-to-server) that manage their own secure storage instead of
  // cookies - but note the response never echoes the token back in
  // JSON either way, so a caller using the body fallback must already
  // possess the token from their own storage, not from this response.
  const incomingToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;

  if (!incomingToken) {
    res.status(400);
    throw new Error("No refresh token provided");
  }

  let decoded;
  try {
    decoded = jwt.verify(incomingToken, process.env.JWT_REFRESH_SECRET);
  } catch (error) {
    res.status(401);
    throw new Error("Invalid or expired refresh token. Please log in again.");
  }

  const user = await User.findById(decoded.id).select("+refreshTokenHash");

  if (!user || !user.refreshTokenHash) {
    res.status(401);
    throw new Error("Refresh token has been revoked. Please log in again.");
  }

  // Must be the exact refresh token we last issued (blocks reuse of an
  // old token from before the last refresh/logout).
  if (hashToken(incomingToken) !== user.refreshTokenHash) {
    res.status(401);
    throw new Error("Refresh token has been revoked. Please log in again.");
  }

  if (user.refreshTokenExpires && user.refreshTokenExpires < new Date()) {
    res.status(401);
    throw new Error("Refresh token has expired. Please log in again.");
  }

  if (user.status === "Inactive") {
    res.status(403);
    throw new Error("Your account is inactive. Contact your admin.");
  }

  // Rotate: issue a brand new pair, invalidating the one just used.
  const accessToken = await issueTokenPair(user, res);

  res.status(200).json({ success: true, token: accessToken });
});

/**
 * @desc   Logout (session only - does not punch the employee out; use
 *         the Punch Out button for that). Revokes the refresh token
 *         server-side and clears the httpOnly cookie.
 * @route  POST /api/auth/logout
 * @access Private
 */
const logout = asyncHandler(async (req, res) => {
  const user = req.user;
  user.isLoggedIn = false;
  user.lastLogoutTime = new Date();
  user.refreshTokenHash = null;
  user.refreshTokenExpires = null;
  await user.save();

  res.clearCookie(REFRESH_COOKIE_NAME, { path: "/api/auth" });

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
  // Changing the password also revokes the existing refresh token, so
  // a session on another device using the old credentials is cut off.
  user.refreshTokenHash = null;
  user.refreshTokenExpires = null;
  await user.save();

  res.clearCookie(REFRESH_COOKIE_NAME, { path: "/api/auth" });

  res.status(200).json({ success: true, message: "Password updated successfully" });
});

module.exports = { login, refreshToken, logout, getMe, changePassword };