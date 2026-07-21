const express = require("express");
const {
  getAdmins,
  getAdminById,
  createAdmin,
  updateAdmin,
  deleteAdmin,
  setAdminStatus,
  setAdminUserLimit,
} = require("../controllers/adminController");
const { protect, superAdminOnly } = require("../middlewares/authMiddleware");

const router = express.Router();

// Every route here requires an authenticated superadmin
router.use(protect, superAdminOnly);

router.route("/").get(getAdmins).post(createAdmin);
router.route("/:id").get(getAdminById).put(updateAdmin).delete(deleteAdmin);
router.patch("/:id/status", setAdminStatus);
router.patch("/:id/limit", setAdminUserLimit);

module.exports = router;
