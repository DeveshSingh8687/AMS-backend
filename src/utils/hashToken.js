const crypto = require("crypto");

/**
 * One-way hash used to store refresh tokens in MongoDB without keeping
 * the raw token value at rest (same idea as password hashing, but
 * SHA-256 is fine here since refresh tokens are already high-entropy
 * random-looking JWTs, not user-chosen secrets).
 */
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

module.exports = hashToken;