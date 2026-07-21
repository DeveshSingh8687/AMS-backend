const express = require("express");
const { getDashboardStats } = require("../controllers/dashboardController");
const { protect, adminOnly } = require("../middlewares/authMiddleware");

const router = express.Router();

router.get("/", protect, adminOnly, getDashboardStats);

module.exports = router;
