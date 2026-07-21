const cron = require("node-cron");
const Attendance = require("../models/Attendance");
const { hoursBetween } = require("../utils/dateHelpers");

const AUTO_LOGOUT_HOURS = Number(process.env.AUTO_LOGOUT_HOURS || 18);

/**
 * Runs every 10 minutes. Finds any attendance record still "punched_in"
 * (no punch-out yet) whose punch-in time is older than AUTO_LOGOUT_HOURS,
 * and force-closes it - sets punchOut to now, computes hours, marks
 * status "present" and autoLogout: true.
 *
 * This is what makes "if the employee forgets to punch out, auto
 * punch-out after 18 hours" happen even if they never reopen the app.
 */
const startAutoLogoutJob = () => {
  cron.schedule("*/10 * * * *", async () => {
    try {
      const openSessions = await Attendance.find({ status: "punched_in" });
      const now = new Date();

      for (const record of openSessions) {
        const hoursOpen = hoursBetween(now, record.punchIn.time);

        if (hoursOpen >= AUTO_LOGOUT_HOURS) {
          record.punchOut = { time: now, location: record.punchIn.location };
          record.hours = Number(hoursOpen.toFixed(2));
          record.status = "present";
          record.autoLogout = true;
          await record.save();
          console.log(
            `[auto-punch-out] Closed session for ${record.employeeId} after ${hoursOpen.toFixed(1)}h`
          );
        }
      }
    } catch (error) {
      console.error("[auto-punch-out] job failed:", error.message);
    }
  });

  console.log(
    `Auto punch-out job scheduled (checks every 10 min, threshold ${AUTO_LOGOUT_HOURS}h)`
  );
};

module.exports = startAutoLogoutJob;
