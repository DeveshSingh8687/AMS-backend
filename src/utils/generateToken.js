const jwt = require("jsonwebtoken");

/**
 * Signs a JWT containing the user's id and role.
 * Expiry is controlled by JWT_EXPIRES_IN in .env
 */
const generateToken = (userId, role) => {
  return jwt.sign({ id: userId, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "18h",
  });
};

/**
 * Short-lived token sent as `Authorization: Bearer <token>` on every
 * protected request. Expiry controlled by JWT_EXPIRES_IN in .env.
 */
const generateAccessToken = (userId, role) => {
  return jwt.sign({ id: userId, role }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "18h",
  });
};

/**
 * Long-lived token used ONLY to obtain a new access token via
 * POST /api/auth/refresh once the access token expires. Signed with a
 * separate secret so a leaked access token can't be used to mint
 * refresh tokens. Expiry controlled by JWT_REFRESH_EXPIRES_IN in .env.
 */
const generateRefreshToken = (userId, role) => {
  return jwt.sign({ id: userId, role }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || "30d",
  });
};

module.exports = { generateToken, generateAccessToken, generateRefreshToken};
