const express = require("express");
const {
  login,
  refreshToken,
  logout,
  getMe,
  changePassword,
} = require("../controllers/authController");
const { protect } = require("../middlewares/authMiddleware");

const router = express.Router();

router.post("/login", login);
// Public: the refresh token itself (not the expired access token) is
// what authenticates this request, so it deliberately skips `protect`.
router.post("/refresh", refreshToken);
router.post("/logout", protect, logout);
router.get("/me", protect, getMe);
router.put("/change-password", protect, changePassword);

module.exports = router;