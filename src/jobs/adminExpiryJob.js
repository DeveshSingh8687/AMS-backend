const cron = require("node-cron");
const User = require("../models/User");

/**
 * Runs every 30 minutes. Finds any admin who:
 *   - has an `activeUntil` date set by the superadmin, and
 *   - that date has now passed, and
 *   - is currently "Active"
 * ...and automatically flips their status to "Inactive". This blocks
 * further login attempts (see authController.login) and the `protect`
 * middleware will reject their existing token on their very next
 * request, regardless of how mid-session they were.
 *
 * The superadmin can reactivate the admin at any time from the Admin
 * Management screen (PATCH /api/admins/:id/status).
 */
const startAdminExpiryJob = () => {
  cron.schedule("*/30 * * * *", async () => {
    try {
      const expiredAdmins = await User.find({
        role: "admin",
        status: "Active",
        activeUntil: { $ne: null, $lte: new Date() },
      });

      for (const admin of expiredAdmins) {
        admin.status = "Inactive";
        admin.isLoggedIn = false;
        await admin.save();
        console.log(
          `[admin-expiry] Deactivated ${admin.email} (activeUntil ${admin.activeUntil.toISOString()})`
        );
      }
    } catch (error) {
      console.error("[admin-expiry] job failed:", error.message);
    }
  });

  console.log("Admin expiry job scheduled (checks every 30 min)");
};

module.exports = startAdminExpiryJob;
