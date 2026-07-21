const mongoose = require("mongoose");

const locationSchema = new mongoose.Schema(
  {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    address: { type: String, default: "" },
  },
  { _id: false }
);

const attendanceSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Denormalized for fast filtering/search without populate
    employeeId: {
      type: String,
      required: true,
    },
    employeeName: {
      type: String,
      required: true,
    },
    department: {
      type: String,
      default: "",
    },
    // Calendar date this punch session belongs to, format YYYY-MM-DD
    // (local server date). NOTE: this is intentionally NOT unique per
    // employee - an employee can punch in/out more than once in the
    // same day (e.g. punch out for lunch, punch back in later), each
    // becoming its own attendance document, matching the frontend's
    // Punch In / Punch Out flow.
    date: {
      type: String,
      required: true,
      index: true,
    },
    punchIn: {
      time: { type: Date, required: true },
      location: { type: locationSchema, default: null },
    },
    punchOut: {
      time: { type: Date, default: null },
      location: { type: locationSchema, default: null },
    },
    hours: {
      type: Number,
      default: null,
    },
    // Lowercase to match the frontend exactly (r.status === "present" etc.)
    status: {
      type: String,
      enum: ["punched_in", "present"],
      default: "punched_in",
    },
    // true if the system auto-closed this session (18h rule) rather
    // than the employee manually punching out
    autoLogout: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

attendanceSchema.index({ employee: 1, date: 1 });

module.exports = mongoose.model("Attendance", attendanceSchema);
