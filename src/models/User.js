const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please enter a valid email"],
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
      select: false, // never return password by default
    },
    // Unique employee identifier shown across the UI (e.g. EMP002)
    employeeId: {
      type: String,
      required: [true, "Employee ID is required"],
      unique: true,
      trim: true,
      uppercase: true,
    },
    phone: {
      type: String,
      trim: true,
      default: "",
    },
    department: {
      type: String,
      trim: true,
      default: "",
    },
    designation: {
      type: String,
      trim: true,
      default: "",
    },
    role: {
      type: String,
      enum: ["superadmin", "admin", "employee"],
      default: "employee",
    },
    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active",
    },
    // Who created this account:
    //  - for an "employee", this is the admin who added them (their manager)
    //  - for an "admin", this is the superadmin who created them
    // Used to scope admins to only their own employees, and to compute
    // how many employees an admin currently has against their userLimit.
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // ADMIN-ONLY: maximum number of employees this admin is allowed to
    // create/manage (e.g. 20, 50, 100). null/undefined = unlimited.
    // Set and changed by the superadmin at any time.
    userLimit: {
      type: Number,
      default: null,
      min: 0,
    },
    // ADMIN-ONLY: optional expiry date set by the superadmin. Once this
    // date has passed, a scheduled job automatically flips the admin's
    // status to "Inactive". The superadmin can reactivate them at any
    // time (see adminController.setAdminStatus).
    activeUntil: {
      type: Date,
      default: null,
    },
    // Whether this user is currently allowed to log in.
    // Admin can toggle this (the toggle icon in User Management screen).
    loginEnable: {
      type: Boolean,
      default: true,
    },
    // Tracks whether the user currently has an open session
    // (punched in but not punched out yet -> "Active Now" on dashboard)
    isLoggedIn: {
      type: Boolean,
      default: false,
    },
    lastLoginTime: {
      type: Date,
      default: null,
    },
    lastLogoutTime: {
      type: Date,
      default: null,
    },
    refreshTokenHash: {
      type: String,
      select: false,
      default: null,
    },
    refreshTokenExpires: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Hash password whenever it is created/changed
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Instance method to compare a plaintext password with the hashed one
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Never leak the password hash even if select('+password') was used elsewhere
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.refreshTokenHash;
  return obj;
};

module.exports = mongoose.model("User", userSchema);
