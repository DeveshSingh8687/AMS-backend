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

module.exports = generateToken;
