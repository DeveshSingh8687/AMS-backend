/**
 * Hand-written OpenAPI 3.0 spec for the AttendEase API, served at
 * GET /api/docs (interactive Swagger UI) via src/app.js.
 *
 * Kept as a single plain object (rather than scattering JSDoc comments
 * across every route file) so it's easy to scan and edit in one place.
 * If you add/change a route, update it here too.
 */

const bearerAuth = { bearerAuth: [] };

const schemas = {
  ErrorResponse: {
    type: "object",
    properties: {
      success: { type: "boolean", example: false },
      message: { type: "string", example: "Something went wrong" },
    },
  },
  User: {
    type: "object",
    properties: {
      _id: { type: "string" },
      name: { type: "string", example: "John Doe" },
      email: { type: "string", example: "employee@attendease.com" },
      employeeId: { type: "string", example: "EMP002" },
      phone: { type: "string", example: "9876543210" },
      department: { type: "string", example: "Operations" },
      designation: { type: "string", example: "Employee" },
      role: { type: "string", enum: ["superadmin", "admin", "employee"] },
      status: { type: "string", enum: ["Active", "Inactive"] },
      loginEnable: { type: "boolean", example: true },
      isLoggedIn: { type: "boolean", example: false },
      lastLoginTime: { type: "string", format: "date-time", nullable: true },
      lastLogoutTime: { type: "string", format: "date-time", nullable: true },
      createdBy: { type: "string", nullable: true },
      userLimit: { type: "number", nullable: true, example: 20 },
      activeUntil: { type: "string", format: "date", nullable: true },
      createdAt: { type: "string", format: "date-time" },
    },
  },
  Location: {
    type: "object",
    properties: {
      latitude: { type: "number", example: 28.391962 },
      longitude: { type: "number", example: 77.055546 },
      address: { type: "string", example: "Sector 67, Sector 66, Gurgaon, Haryana" },
    },
  },
  Attendance: {
    type: "object",
    properties: {
      _id: { type: "string" },
      employee: { type: "string" },
      employeeId: { type: "string", example: "EMP002" },
      employeeName: { type: "string", example: "John Doe" },
      date: { type: "string", example: "2026-07-20" },
      punchIn: {
        type: "object",
        properties: {
          time: { type: "string", format: "date-time" },
          location: { $ref: "#/components/schemas/Location" },
        },
      },
      punchOut: {
        type: "object",
        properties: {
          time: { type: "string", format: "date-time" },
          location: { $ref: "#/components/schemas/Location" },
        },
      },
      hours: { type: "number", example: 8.5 },
      status: { type: "string", enum: ["Present", "Absent"] },
      autoLogout: { type: "boolean" },
    },
  },
};

const paths = {
  "/health": {
    get: {
      tags: ["Health"],
      summary: "Check the API is running",
      responses: { 200: { description: "OK" } },
    },
  },

  // ---------- AUTH ----------
  "/auth/login": {
    post: {
      tags: ["Auth"],
      summary: "Login (plain authentication - does not punch in)",
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["email", "password"],
              properties: {
                email: { type: "string", example: "superadmin@attendease.com" },
                password: { type: "string", example: "SuperAdmin@12345" },
              },
            },
          },
        },
      },
      responses: {
        200: { description: "Login successful, returns JWT token + user" },
        401: { description: "Invalid credentials" },
        403: { description: "Login disabled / account inactive" },
      },
    },
  },
  "/auth/logout": {
    post: {
      tags: ["Auth"],
      summary: "Logout (session only - does not punch out)",
      security: [bearerAuth],
      responses: { 200: { description: "Logout successful" } },
    },
  },
  "/auth/me": {
    get: {
      tags: ["Auth"],
      summary: "Get the logged-in user's own account",
      security: [bearerAuth],
      responses: { 200: { description: "Current user" } },
    },
  },
  "/auth/change-password": {
    put: {
      tags: ["Auth"],
      summary: "Change my own password (email is not editable)",
      security: [bearerAuth],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["currentPassword", "newPassword"],
              properties: {
                currentPassword: { type: "string" },
                newPassword: { type: "string", minLength: 6 },
              },
            },
          },
        },
      },
      responses: { 200: { description: "Password updated" } },
    },
  },

  // ---------- ADMINS (superadmin only) ----------
  "/admins": {
    get: {
      tags: ["Admins (Superadmin)"],
      summary: "List all admins (with live employeeCount)",
      security: [bearerAuth],
      parameters: [{ name: "search", in: "query", schema: { type: "string" } }],
      responses: { 200: { description: "List of admins" } },
    },
    post: {
      tags: ["Admins (Superadmin)"],
      summary: "Create a new admin",
      security: [bearerAuth],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name", "employeeId", "email", "password"],
              properties: {
                name: { type: "string" },
                employeeId: { type: "string", example: "ADM001" },
                email: { type: "string" },
                password: { type: "string" },
                phone: { type: "string" },
                department: { type: "string" },
                designation: { type: "string" },
                userLimit: { type: "number", nullable: true, example: 50 },
                activeUntil: { type: "string", format: "date", nullable: true },
              },
            },
          },
        },
      },
      responses: { 201: { description: "Admin created" } },
    },
  },
  "/admins/{id}": {
    get: {
      tags: ["Admins (Superadmin)"],
      summary: "Get one admin by id",
      security: [bearerAuth],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "Admin detail" }, 404: { description: "Not found" } },
    },
    put: {
      tags: ["Admins (Superadmin)"],
      summary: "Update an admin (name, phone, department, designation, userLimit, activeUntil, optional password reset)",
      security: [bearerAuth],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                phone: { type: "string" },
                department: { type: "string" },
                designation: { type: "string" },
                userLimit: { type: "number", nullable: true },
                activeUntil: { type: "string", format: "date", nullable: true },
                password: { type: "string" },
              },
            },
          },
        },
      },
      responses: { 200: { description: "Admin updated" } },
    },
    delete: {
      tags: ["Admins (Superadmin)"],
      summary: "Delete an admin (their employees are kept, just unassigned)",
      security: [bearerAuth],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "Admin deleted" } },
    },
  },
  "/admins/{id}/status": {
    patch: {
      tags: ["Admins (Superadmin)"],
      summary: "Activate / deactivate an admin (also how you reactivate after activeUntil expiry)",
      security: [bearerAuth],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["status"],
              properties: {
                status: { type: "string", enum: ["Active", "Inactive"] },
                activeUntil: { type: "string", format: "date", nullable: true },
              },
            },
          },
        },
      },
      responses: { 200: { description: "Status updated" } },
    },
  },
  "/admins/{id}/limit": {
    patch: {
      tags: ["Admins (Superadmin)"],
      summary: "Change how many employees this admin may manage",
      security: [bearerAuth],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["userLimit"],
              properties: {
                userLimit: { type: "number", nullable: true, example: 100 },
              },
            },
          },
        },
      },
      responses: { 200: { description: "Limit updated" } },
    },
  },

  // ---------- USERS / EMPLOYEES (admin + superadmin) ----------
  "/users": {
    get: {
      tags: ["Employees"],
      summary: "List employees (admin sees only their own, superadmin sees all)",
      security: [bearerAuth],
      parameters: [{ name: "search", in: "query", schema: { type: "string" } }],
      responses: { 200: { description: "List of employees" } },
    },
    post: {
      tags: ["Employees"],
      summary: "Add a new employee (counts against the admin's userLimit)",
      security: [bearerAuth],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: {
              type: "object",
              required: ["name", "employeeId", "email"],
              properties: {
                name: { type: "string" },
                employeeId: { type: "string", example: "EMP002" },
                email: { type: "string" },
                phone: { type: "string" },
                department: { type: "string" },
                designation: { type: "string" },
                status: { type: "string", enum: ["Active", "Inactive"] },
                password: { type: "string", description: "Optional - a temp password is generated if omitted" },
              },
            },
          },
        },
      },
      responses: {
        201: { description: "Employee created" },
        403: { description: "Employee limit reached" },
      },
    },
  },
  "/users/{id}": {
    get: {
      tags: ["Employees"],
      summary: "Get one employee by id",
      security: [bearerAuth],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "Employee detail" } },
    },
    put: {
      tags: ["Employees"],
      summary: "Update an employee (email not editable)",
      security: [bearerAuth],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                employeeId: { type: "string" },
                phone: { type: "string" },
                department: { type: "string" },
                designation: { type: "string" },
                status: { type: "string", enum: ["Active", "Inactive"] },
              },
            },
          },
        },
      },
      responses: { 200: { description: "Employee updated" } },
    },
    delete: {
      tags: ["Employees"],
      summary: "Delete an employee",
      security: [bearerAuth],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "Employee deleted" } },
    },
  },
  "/users/{id}/toggle-login": {
    patch: {
      tags: ["Employees"],
      summary: "Enable/disable this employee's ability to log in",
      security: [bearerAuth],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "loginEnable flipped" } },
    },
  },

  // ---------- ATTENDANCE ----------
  "/attendance/punch-in": {
    post: {
      tags: ["Attendance"],
      summary: "Punch in (starts a new attendance session)",
      security: [bearerAuth],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                latitude: { type: "number", example: 28.391962 },
                longitude: { type: "number", example: 77.055546 },
              },
            },
          },
        },
      },
      responses: {
        201: { description: "Punched in" },
        409: { description: "Already punched in / too soon to punch in again (12h rule)" },
      },
    },
  },
  "/attendance/punch-out": {
    post: {
      tags: ["Attendance"],
      summary: "Punch out (closes the current open session)",
      security: [bearerAuth],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                latitude: { type: "number" },
                longitude: { type: "number" },
              },
            },
          },
        },
      },
      responses: {
        200: { description: "Punched out" },
        400: { description: "Not currently punched in" },
      },
    },
  },
  "/attendance/my-history": {
    get: {
      tags: ["Attendance"],
      summary: "My own attendance history (employee)",
      security: [bearerAuth],
      parameters: [
        { name: "from", in: "query", schema: { type: "string", example: "2026-07-01" } },
        { name: "to", in: "query", schema: { type: "string", example: "2026-07-31" } },
        { name: "page", in: "query", schema: { type: "integer" } },
        { name: "limit", in: "query", schema: { type: "integer" } },
      ],
      responses: { 200: { description: "My attendance records" } },
    },
  },
  "/attendance": {
    get: {
      tags: ["Attendance"],
      summary: "Attendance Management table (admin/superadmin, scoped to own employees)",
      security: [bearerAuth],
      parameters: [
        { name: "search", in: "query", schema: { type: "string" } },
        { name: "employee", in: "query", schema: { type: "string" } },
        { name: "status", in: "query", schema: { type: "string", enum: ["All", "Present", "Absent"] } },
        { name: "from", in: "query", schema: { type: "string" } },
        { name: "to", in: "query", schema: { type: "string" } },
        { name: "page", in: "query", schema: { type: "integer" } },
        { name: "limit", in: "query", schema: { type: "integer" } },
      ],
      responses: { 200: { description: "Attendance records" } },
    },
  },
  "/attendance/{id}": {
    get: {
      tags: ["Attendance"],
      summary: "Attendance Detail screen for a single record",
      security: [bearerAuth],
      parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
      responses: { 200: { description: "Attendance record detail" } },
    },
  },
  "/attendance/export/csv": {
    get: {
      tags: ["Attendance"],
      summary: "Download filtered attendance as CSV",
      security: [bearerAuth],
      responses: { 200: { description: "CSV file", content: { "text/csv": {} } } },
    },
  },
  "/attendance/export/pdf": {
    get: {
      tags: ["Attendance"],
      summary: "Download filtered attendance as PDF",
      security: [bearerAuth],
      responses: { 200: { description: "PDF file", content: { "application/pdf": {} } } },
    },
  },

  // ---------- DASHBOARD ----------
  "/dashboard": {
    get: {
      tags: ["Dashboard"],
      summary: "Admin dashboard stats + today's attendance",
      security: [bearerAuth],
      responses: { 200: { description: "Dashboard stats" } },
    },
  },

  // ---------- PROFILE ----------
  "/profile": {
    get: {
      tags: ["Profile"],
      summary: "Get my own profile",
      security: [bearerAuth],
      responses: { 200: { description: "My profile" } },
    },
    put: {
      tags: ["Profile"],
      summary: "Update my own profile (name, phone, department, designation - not email)",
      security: [bearerAuth],
      requestBody: {
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                name: { type: "string" },
                phone: { type: "string" },
                department: { type: "string" },
                designation: { type: "string" },
              },
            },
          },
        },
      },
      responses: { 200: { description: "Profile updated" } },
    },
  },
};

const swaggerSpec = {
  openapi: "3.0.3",
  info: {
    title: "AttendEase API",
    version: "1.0.0",
    description:
      "Attendance management system backend. Most routes require a Bearer token - " +
      "log in via POST /auth/login, copy the `token` from the response, then click " +
      "the Authorize button above and paste it in (no need to type 'Bearer ').",
  },
  servers: [{ url: "/api" }],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas,
  },
  tags: [
    { name: "Health" },
    { name: "Auth" },
    { name: "Admins (Superadmin)" },
    { name: "Employees" },
    { name: "Attendance" },
    { name: "Dashboard" },
    { name: "Profile" },
  ],
  paths,
};

module.exports = swaggerSpec;
