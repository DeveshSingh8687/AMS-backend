const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");
const swaggerUi = require("swagger-ui-express");
const swaggerSpec = require("./docs/swaggerSpec");

const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const userRoutes = require("./routes/userRoutes");
const attendanceRoutes = require("./routes/attendanceRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const profileRoutes = require("./routes/profileRoutes");
const { notFound, errorHandler } = require("./middlewares/errorMiddleware");

const app = express();

// --- Global middleware ---
// contentSecurityPolicy is disabled because Swagger UI's assets (below)
// need inline scripts/styles that helmet's default CSP blocks. If you
// remove the /api/docs route, feel free to re-enable the default CSP.
app.use(helmet({ contentSecurityPolicy: false }));

// IMPORTANT: cookies + credentials:true require an EXACT origin, never
// "*" - browsers silently refuse to send/receive cookies otherwise.
// Set CLIENT_URL in .env to your frontend's exact origin (no trailing
// slash), e.g. http://localhost:5173 in dev, https://yourapp.com in prod.
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

// --- Health check ---
app.get("/api/health", (req, res) => {
  res.status(200).json({ success: true, message: "AttendEase API is running" });
});

// --- Interactive API docs (Swagger UI) ---
// requestInterceptor makes "Try it out" send cookies too, so testing
// /auth/login -> /auth/refresh works from this page (same-origin).
app.use(
  "/api/docs",
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    swaggerOptions: {
      requestInterceptor: (req) => {
        req.credentials = "include";
        return req;
      },
    },
  })
);

// --- Routes ---
app.use("/api/auth", authRoutes);
app.use("/api/admins", adminRoutes);
app.use("/api/users", userRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/profile", profileRoutes);

// --- Error handling (must be last) ---
app.use(notFound);
app.use(errorHandler);

module.exports = app;