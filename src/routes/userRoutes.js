const express = require("express");
const {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  toggleLoginEnable,
} = require("../controllers/userController");
const { protect, adminOnly } = require("../middlewares/authMiddleware");

const router = express.Router();

// Every route here requires an authenticated admin
router.use(protect, adminOnly);

router.route("/").get(getUsers).post(createUser);
router.route("/:id").get(getUserById).put(updateUser).delete(deleteUser);
router.patch("/:id/toggle-login", toggleLoginEnable);

module.exports = router;
