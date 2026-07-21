# AttendEase Backend

Node.js + Express + MongoDB backend for the AttendEase attendance management system.

## 1. Folder structure

```
attendease-backend/
├── server.js                  # entry point
├── package.json
├── .env.example                # copy to .env and fill in your values
├── src/
│   ├── app.js                  # express app + route mounting
│   ├── config/
│   │   └── db.js               # MongoDB connection
│   ├── models/
│   │   ├── User.js              # admin + employee accounts
│   │   └── Attendance.js       # one record per employee per day
│   ├── controllers/
│   │   ├── authController.js       # login/logout (= punch in/out for employees), change password
│   │   ├── adminController.js      # superadmin: create/update/delete/list admins, status, limits
│   │   ├── userController.js       # admin/superadmin: create/update/delete/list employees
│   │   ├── attendanceController.js # admin: attendance list/detail/CSV/PDF, employee: history
│   │   ├── dashboardController.js  # admin dashboard stats
│   │   └── profileController.js    # view/update own profile
│   ├── routes/                 # one file per resource, wires up controllers
│   ├── docs/
│   │   └── swaggerSpec.js      # OpenAPI spec served at /api/docs
│   ├── middlewares/
│   │   ├── authMiddleware.js    # protect (JWT) + adminOnly + superAdminOnly
│   │   └── errorMiddleware.js   # centralized error handling
│   ├── jobs/
│   │   ├── autoLogoutJob.js     # cron: force-logout employee sessions open > 18h
│   │   └── adminExpiryJob.js    # cron: auto-deactivate admins past their activeUntil date
│   ├── utils/
│   │   ├── generateToken.js
│   │   ├── dateHelpers.js
│   │   └── geocode.js           # lat/lng -> address (OpenStreetMap, free)
│   └── scripts/
│       └── createSuperAdmin.js  # run once to create your first superadmin
```

## 2. Setup

```bash
cd attendease-backend
npm install
cp .env.example .env
```

Edit `.env`:
- `MONGO_URI` – your MongoDB connection string (local or Atlas)
- `JWT_SECRET` – any long random string
- `CLIENT_URL` – your Next.js frontend URL (for CORS)

Create your first superadmin account:

```bash
npm run seed:superadmin
```

This reads `SUPERADMIN_EMAIL` / `SUPERADMIN_PASSWORD` / `SUPERADMIN_EMPLOYEE_ID` from `.env` and creates one superadmin user. Log in with those credentials, then:
1. Create admins from `POST /api/admins` (set their `userLimit` and optional `activeUntil`)
2. Each admin logs in and creates their own employees from the User Management screen (`POST /api/users`)

Run the server:

```bash
npm run dev      # with nodemon, auto-restarts on file changes
# or
npm start
```

Server runs on `http://localhost:5000` by default. Health check: `GET /api/health`.

### Interactive API docs (Swagger)

Once the server is running, open:

```
http://localhost:5000/api/docs
```

This is a full interactive Swagger UI covering every route in this README. To test protected routes:
1. Expand `POST /auth/login`, click **Try it out**, run it with real credentials
2. Copy the `token` from the response
3. Click the **Authorize** button (top right) and paste the token in (no need to type `Bearer ` — Swagger adds that for you)
4. Now every other endpoint's **Try it out** button will send that token automatically

The spec lives in `src/docs/swaggerSpec.js` as a plain JS object — if you add or change a route later, update it there too.

## 3. Role hierarchy

```
superadmin
   └── creates & manages admins (status, expiry date, employee limit)
admin
   └── creates & manages their own employees (bounded by userLimit)
employee
   └── punches in/out, views own history, edits own profile
```

- **superadmin**: full control over admin accounts — create, update, delete, manually activate/deactivate, set an auto-expiry date, and set/change how many employees each admin may have. Not subject to `loginEnable`, punch-in/out, or the 12h/18h session rules (those are employee-specific). Bootstrap the first superadmin with `npm run seed:superadmin`.
- **admin**: same employee CRUD/dashboard/attendance abilities as before, but now *scoped to only the employees they personally created* (`createdBy`). Subject to `status` (including auto-expiry) and can be deactivated by the superadmin.
- **employee**: unchanged from before.

### Admin-specific fields on the User model
| Field | Meaning |
|---|---|
| `createdBy` | which superadmin created this admin (or which admin created this employee) |
| `userLimit` | max employees this admin may create (e.g. 20/50/100). `null` = unlimited. Defaults to 20 if not specified at creation. |
| `activeUntil` | optional date; once passed, a cron job (`src/jobs/adminExpiryJob.js`, runs every 30 min) automatically sets `status: "Inactive"`. The superadmin can reactivate at any time. |

### Admin Management API (`/api/admins`) — Superadmin only
| Method | Route | Body |
|---|---|---|
| GET | `/?search=` | – |
| GET | `/:id` | – |
| POST | `/` | `{ name, employeeId, email, password, phone, department, designation, userLimit?, activeUntil? }` |
| PUT | `/:id` | any of the above except email; `password` optional to reset it |
| DELETE | `/:id` | – (their employees are kept, just unassigned) |
| PATCH | `/:id/status` | `{ status: "Active"\|"Inactive", activeUntil?: "2026-08-01"\|null }` — manual activate/deactivate; also how you reactivate someone whose `activeUntil` already passed |
| PATCH | `/:id/limit` | `{ userLimit: number\|null }` — change the employee cap any time |

Every admin object returned from `/api/admins` also includes a live `employeeCount` so you can show e.g. "37 / 50 employees" in the UI.

When an admin tries to add an employee past their `userLimit`, `POST /api/users` returns `403` with a clear message — enforced server-side, not just in the UI.

## 4. Core business logic (login vs. punch in/out — these are separate)

Login/logout is plain authentication. Punching in/out is a completely separate action, done from the employee dashboard, matching the actual frontend UI (separate buttons, not tied to session login).

- `POST /api/auth/login` / `POST /api/auth/logout` — just authentication. Governed by `status` (Active/Inactive) and, for employees, the `loginEnable` flag.
- `POST /api/attendance/punch-in` / `POST /api/attendance/punch-out` — marks attendance with location. Each punch-in creates a **new** attendance document (an employee can have multiple punch sessions in the same day, e.g. out for lunch and back).

Punch rules enforced server-side (in `attendanceController.js`), mirroring the frontend's own `canPunchIn`/`canPunchOut` logic exactly:
1. **Can't punch in again while still punched in, unless 12+ hours have passed** (`RELOGIN_BLOCK_HOURS` in `.env`) since that punch-in. If 12h+ have passed without punching out, the stale session is auto-closed and a new punch-in is allowed.
2. **After a completed punch (punched in AND out), can't punch in again until 12+ hours have passed** since that punch-in either.
3. **Auto punch-out after 18 hours** (`AUTO_LOGOUT_HOURS` in `.env`) — a cron job (`src/jobs/autoLogoutJob.js`) runs every 10 minutes and force-closes any attendance session still open past 18h, marking `autoLogout: true`.

Dashboard stats (`GET /api/dashboard`) are computed directly from today's attendance records' `status` field (`"punched_in"` vs `"present"`), matching `AdminDashboard.jsx` exactly.

## 5. API Reference

All protected routes require header: `Authorization: Bearer <token>`

### Auth (`/api/auth`)
| Method | Route | Access | Body |
|---|---|---|---|
| POST | `/login` | Public | `{ email, password }` |
| POST | `/logout` | Private | – |
| GET | `/me` | Private | – |
| PUT | `/change-password` | Private | `{ currentPassword, newPassword }` |

### Users / Employees (`/api/users`) — Admin only
| Method | Route | Body |
|---|---|---|
| GET | `/?search=` | – |
| GET | `/:id` | – |
| POST | `/` | `{ name, employeeId, email, phone, department, designation, status, password? }` |
| PUT | `/:id` | any of the above except email |
| DELETE | `/:id` | – |
| PATCH | `/:id/toggle-login` | – (flips `loginEnable`) |

### Attendance (`/api/attendance`)
| Method | Route | Access | Notes |
|---|---|---|---|
| POST | `/punch-in` | Private | `{ latitude, longitude }` — starts a new session |
| POST | `/punch-out` | Private | `{ latitude, longitude }` — closes the open session |
| GET | `/my-history?from=&to=` | Private | employee's own records |
| GET | `/?search=&employee=&status=&from=&to=&page=&limit=` | Admin | Attendance Management table |
| GET | `/:id` | Private | Attendance Detail screen (admin: any of their employees; employee: own records only) |
| GET | `/export/csv` | Admin | downloads CSV (same filters) |
| GET | `/export/pdf` | Admin | downloads PDF (same filters) |

### Dashboard (`/api/dashboard`) — Admin only
`GET /` → `{ stats: { totalEmployees, presentToday, activeNow, yetToPunch, totalAttendance }, todaysAttendance: [...] }`

### Profile (`/api/profile`)
| Method | Route | Body |
|---|---|---|
| GET | `/` | – |
| PUT | `/` | `{ name, phone, department, designation }` (no email) |

## 6. Notes for a beginner

- **Passwords** are hashed with bcrypt before saving (see `User.js` pre-save hook) — never stored in plain text.
- **JWT** tokens are issued on login and must be sent as `Authorization: Bearer <token>` on every protected request.
- **Employee ID uniqueness** is enforced at the database level (`unique: true` in the schema) and checked explicitly in `userController.js` so you get a friendly error message instead of a raw Mongo error.
- **Location/address**: the frontend sends `latitude`/`longitude`; the backend reverse-geocodes it into a readable address using the free OpenStreetMap Nominatim API (no API key needed). If you already reverse-geocode on the frontend, just also send an `address` field and adjust the controllers to use it directly.
- **Attendance `status` values are lowercase** (`"punched_in"`, `"present"`) to match the frontend's own string comparisons directly — no mapping needed on the frontend side.
- To add more employees for testing without the UI, just call `POST /api/users` with a valid admin token.
# AMS-backend
