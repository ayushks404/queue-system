# 🩺 Smart Appointment & Queue Management System

A multi-branch appointment booking and walk-in queue platform for businesses with limited staff, resources and appointment capacity — built for the **"Smart Appointment & Queue Management System"** full-stack assignment.

It covers scheduling, concurrency-safe booking, real-time queue updates, waitlists, and role-based dashboards for **Customers**, **Staff** and **Admins**, end to end.

**🔗 Live app:** https://queue-frontend-ty00.onrender.com &nbsp;·&nbsp; **📘 API docs (Swagger):** https://queue-backend-t30v.onrender.com/api/docs

---

### 📊 At a glance

| | | | |
|---|---|---|---|
| **3** user roles | **12** REST route groups | **4** real-time Socket.IO events | **3** background jobs |
| **14** core DB entities | **23** backend test files | **2** deployment targets (Docker · Render) | **1** shared event bus |

---

## 📚 Table of Contents

- 🧾 [1. Overview](#1-overview)
- 🧭 [2. Project Flow](#2-project-flow)
- 🧰 [3. Tech Stack](#3-tech-stack)
- 🏗️ [4. System Architecture](#4-system-architecture)
- 🗂️ [5. Project Structure](#5-project-structure)
- ✅ [6. Requirements Coverage](#6-requirements-coverage)
- 🚀 [7. Getting Started](#7-getting-started)
- ⚙️ [8. Environment Variables](#8-environment-variables)
- 🌐 [9. Live Deployment](#9-live-deployment)
- 🔑 [10. Sample Credentials](#10-sample-credentials)
- 🛡️ [11. Roles & Permissions](#11-roles--permissions)
- 🗄️ [12. Database Schema](#12-database-schema)
- 🔌 [13. REST API](#13-rest-api)
- 🧠 [14. Core Business Logic](#14-core-business-logic)
- 🔄 [15. Application & Data Flow](#15-application--data-flow)
- 📡 [16. Real-Time Architecture](#16-real-time-architecture)
- ⏱️ [17. Background Jobs](#17-background-jobs)
- ⚡ [18. Caching Strategy](#18-caching-strategy)
- 🔐 [19. Security](#19-security)
- 🧪 [20. Testing](#20-testing)
- 🤖 [21. CI/CD Pipeline](#21-cicd-pipeline)
- 🖼️ [22. Screenshots](#22-screenshots)
- ⚠️ [23. Known Limitations](#23-known-limitations)
- 📝 [24. Git History](#24-git-history)
- ☁️ [25. Deployment](#25-deployment)

---

## 1. Overview

Build a real-world appointment and queue management platform for a business with multiple branches, limited staff, resources and appointment capacity. The system handles:

- Appointments and time slots
- Cancellations and rescheduling
- No-shows and walk-ins
- Waiting queues and resource allocation
- Notifications, staff operations and administration
- Analytics and operational reporting

The backend is the **sole authority** for availability and booking — the frontend never decides whether a slot is free; it only reflects what `GET /api/availability` and the booking endpoints return.

---

## 2. Project Flow

How a single request moves through the system, across all three roles, from first visit to a completed (or no-show) appointment:

```mermaid
flowchart TD
    Start(["Visitor opens the app"]) --> HasAcct{"Has an account?"}
    HasAcct -->|"No"| Register["Register<br/>always created as CUSTOMER"]
    HasAcct -->|"Yes"| Login["Login"]
    Register --> Login
    Login --> Role{"Role?"}

    Role -->|"Customer"| Browse["Pick branch → service → date"]
    Browse --> Check["GET /api/availability"]
    Check --> Free{"Slot open?"}
    Free -->|"Yes"| Hold["Hold slot<br/>5-minute countdown"]
    Free -->|"No"| Wait["Join waiting list"]
    Wait -.->|"slot frees up"| Hold
    Hold --> Confirm["Confirm booking<br/>appointment number issued"]
    Confirm --> Track["Track appointment +<br/>live queue position"]
    Track --> Attend{"Customer shows up?"}
    Attend -->|"Yes"| CheckIn["Checked-in by staff"]
    Attend -->|"No"| NoShow["Marked NO_SHOW<br/>resources released, waitlist processed"]
    CheckIn --> Progress["In progress"]
    Progress --> Done["Completed"]

    Role -->|"Staff"| StaffOps["Run today's queue:<br/>check-in · call next · walk-ins · no-show"]
    StaffOps --> Progress

    Role -->|"Admin"| AdminOps["Configure branches, services,<br/>resources & schedules — view analytics"]
```

Every branch in the diamond decisions is enforced **server-side** — see [§14 Core Business Logic](#14-core-business-logic) for exactly how each of these is implemented safely under concurrent load.

---

## 3. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript, Vite, Socket.IO client |
| Backend | Node.js + Express + TypeScript |
| Database | PostgreSQL 16, Prisma ORM |
| Cache / Queues | Redis 7, BullMQ |
| Real-time | Socket.IO |
| Auth | JWT (access + refresh), bcrypt |
| Validation | Zod |
| API docs | Swagger UI / OpenAPI 3.0 (`swagger-ui-express`) |
| Testing | Node's built-in test runner (`node --test`) on the backend, Vitest + React Testing Library on the frontend |
| CI/CD | GitHub Actions (test → build → deploy) |
| Containerization | Docker, Docker Compose |

---

## 4. System Architecture

```mermaid
flowchart TB
    subgraph Client["Client"]
        FE["Frontend<br/>React + Vite<br/>:5173 dev / :80 Docker"]
    end

    subgraph Backend["Backend — Express :3000"]
        API["REST API<br/>/api/*"]
        WS["Socket.IO server<br/>realtime/socket.ts<br/>branch + per-user rooms"]
        MODULES["Modules<br/>auth · catalog · booking · waitlist<br/>queue · notifications · reports"]
        BUS["events/bus.ts<br/>in-process EventEmitter"]
    end

    subgraph Jobs["Background Worker — genuinely separate process"]
        WORKER["worker.ts<br/>Docker: dedicated 'worker' container<br/>Render: dedicated 'queue-worker' service"]
        BULLMQ["queues/*.ts<br/>BullMQ job definitions"]
    end

    subgraph Data["Data Layer"]
        PG[("PostgreSQL<br/>persistent data")]
        REDIS[("Redis<br/>cache · BullMQ · pub/sub<br/>token revocation")]
    end

    FE -- "REST" --> API
    FE <-- "WebSocket" --> WS
    API --> MODULES
    MODULES --> BUS
    BUS <-. "Redis pub/sub<br/>(cross-process events)" .-> REDIS
    WS --> BUS
    MODULES --> PG
    MODULES --> REDIS
    WORKER --> BULLMQ
    BULLMQ --> REDIS
    WORKER --> PG
    BUS -.->|"enqueues jobs"| BULLMQ
```

The background worker (§17) always runs as its **own process** — a separate Docker Compose container locally, and a separate Render Background Worker service (`queue-worker`) in production. There is no "inline" mode; the same `worker.ts` entry point is used everywhere.

---

## 5. Project Structure

A high-level map of the codebase — the full file tree is in the collapsible section below.

```mermaid
flowchart TB
    subgraph ROOT["queue-system/"]
        direction LR
        subgraph FE["frontend/  — React + Vite"]
            FE1["src/components/<br/>auth · booking · customer<br/>staff · admin · notifications"]
            FE2["src/context/<br/>Auth · Socket · Notification"]
            FE3["src/api/client.ts"]
        end

        subgraph BE["backend/  — Express + TypeScript"]
            BE1["src/modules/<br/>auth · admin · catalog · booking<br/>waitlist · queue · notifications · reports"]
            BE2["src/realtime/socket.ts"]
            BE3["src/events/bus.ts"]
            BE4["src/queues/<br/>BullMQ job definitions"]
            BE5["src/worker.ts"]
            BE6["prisma/<br/>schema + migrations + seed"]
        end

        INFRA["docker-compose.yml · render.yaml · .github/workflows/ci.yml"]
    end

    FE3 -. "REST + WebSocket" .-> BE1
    BE1 --> BE3
    BE3 -. "cross-process" .-> BE4
    BE4 --> BE5
```

<details>
<summary><strong>📁 Full folder tree (click to expand)</strong></summary>

```
queue-system/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma          # data model — see §12
│   │   ├── migrations/
│   │   └── seed.ts                # branches, resources, services sample data
│   ├── src/
│   │   ├── index.ts                # Express app, startup, health check, admin auto-provisioning
│   │   ├── worker.ts               # standalone background-job process (Docker + Render both)
│   │   ├── docs/
│   │   │   └── swagger.ts          # OpenAPI spec, served at /api/docs
│   │   ├── events/
│   │   │   └── bus.ts              # in-process EventEmitter + Redis pub/sub mirror
│   │   ├── realtime/
│   │   │   └── socket.ts           # Socket.IO server, room management
│   │   ├── lib/
│   │   │   ├── prisma.ts           # Prisma client singleton
│   │   │   ├── redis.ts            # Redis client factory
│   │   │   └── corsOrigins.ts      # CORS allow-list logic
│   │   ├── middleware/
│   │   │   ├── rateLimiter.ts
│   │   │   └── schemas.ts          # Zod validation schemas
│   │   ├── queues/                 # BullMQ job definitions
│   │   │   ├── reservationExpiry.queue.ts
│   │   │   ├── waitlist.queue.ts
│   │   │   └── appointmentReminders.queue.ts
│   │   └── modules/                 # one folder per domain — controller + routes (+ events)
│   │       ├── auth/                # register, login, refresh, RBAC middleware
│   │       ├── admin/                # user management, role promotion
│   │       ├── catalog/              # branches, services, resources, schedules
│   │       ├── booking/              # availability engine, reservations, appointments,
│   │       │                         # appointment state machine
│   │       ├── waitlist/             # waitlist CRUD + event subscribers
│   │       ├── queue/                # walk-in queue, queue state machine
│   │       ├── notifications/        # in-app notifications + event subscribers
│   │       ├── reports/              # analytics aggregates
│   │       └── security/             # security-focused test suite
│   ├── Dockerfile
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/
│   │   │   └── client.ts           # fetch wrapper, VITE_API_URL base
│   │   ├── context/
│   │   │   ├── AuthContext.tsx
│   │   │   ├── SocketContext.tsx   # Socket.IO connection lifecycle
│   │   │   └── NotificationContext.tsx
│   │   └── components/
│   │       ├── auth/                # AuthModal (login/register)
│   │       ├── booking/             # BookingWizard, SlotHoldTimer
│   │       ├── customer/            # CustomerDashboard
│   │       ├── staff/               # StaffDashboard
│   │       ├── admin/               # AdminDashboard
│   │       ├── notifications/       # NotificationDrawer
│   │       └── layout/              # Navbar, ToastContainer
│   ├── Dockerfile
│   └── package.json
│
├── .github/workflows/ci.yml         # test → build → deploy pipeline — see §21
├── docker-compose.yml               # postgres, redis, backend, worker, frontend
├── render.yaml                      # Render Blueprint — see §25
└── readme.md
```

</details>

---

## 6. Requirements Coverage

A direct map from the assignment brief to where each requirement is implemented and documented, so nothing is left to guesswork during review.

| # | Assignment Requirement | Where it's covered | Status |
|---|---|---|---|
| 1 | Project overview & objectives | [§1](#1-overview) | ✅ |
| 2 | User roles & authentication (Customer/Staff/Admin, JWT, RBAC) | [§11](#11-roles--permissions), [§19](#19-security) | ✅ |
| 3 | Branch management (hours, holidays, active status) | [§12](#12-database-schema) `branches`, `business_hours`, `holidays` | ✅ |
| 4 | Service & resource management | [§12](#12-database-schema) `services`, `resources`, `service_resources` | ✅ |
| 5 | Availability & slot engine | [§14.1](#141-booking-flow--concurrency), [§13](#13-rest-api) `GET /api/availability` | ✅ |
| 6 | Appointment booking (branch → service → date → time → confirm) | [§2](#2-project-flow), [§15.1](#151-booking-flow-with-concurrency-handling) | ✅ |
| 7 | Appointment lifecycle & valid status transitions | [§14.6](#146-appointment-lifecycle) state diagram | ✅ |
| 8 | Rescheduling & cancellation | [§14.7](#147-rescheduling--cancellation) | ✅ |
| 9 | Temporary slot reservation with countdown & auto-expiry | [§14.3](#143-reservation-expiry) | ✅ |
| 10 | Waiting list management & ordering algorithm | [§14.4](#144-waitlist-ordering--eligibility) | ✅ |
| 11 | Walk-in & queue management | [§15.2](#152-real-time-queue--walk-in-flow) | ✅ |
| 12 | Queue prioritization & no-show handling | [§14.5](#145-queue-prioritization--no-shows) | ✅ |
| 13 | Real-time queue updates (WebSockets) | [§16](#16-real-time-architecture) | ✅ |
| 14 | Notifications (in-app; email/SMS/push optional) | [§15.3](#153-notification-flow) | ✅ (in-app) / ⭕ optional channels not built |
| 15 | Customer, Staff & Admin dashboards | [§2](#2-project-flow), [§11](#11-roles--permissions), [§22](#22-screenshots) | ✅ |
| 16 | Analytics & reporting | `reports` module, `/api/reports` — numeric aggregates ([§23](#23-known-limitations): charts not rendered) | ✅ (data) / ⭕ charts optional |
| 17 | REST API & database design + ER diagram | [§12](#12-database-schema), [§13](#13-rest-api) | ✅ |
| 18 | Concurrency, idempotency & consistent error shape | [§14.1](#141-booking-flow--concurrency), [§14.2](#142-idempotency) | ✅ |
| 19 | Security, testing & performance (Redis, TTL, invalidation) | [§18](#18-caching-strategy), [§19](#19-security), [§20](#20-testing) | ✅ |
| 20 | Background jobs, Docker, Git, documentation | [§17](#17-background-jobs), [§21](#21-cicd-pipeline), [§24](#24-git-history), this file | ✅ |
| — | GitHub repo / live deployment / working app *(required deliverables)* | [§9](#9-live-deployment) | ✅ |
| — | CI/CD pipeline *(optional deliverable)* | [§21](#21-cicd-pipeline) | ✅ |
| — | .env.example, Docker config, Swagger, sample credentials, screenshots *(optional)* | [§8](#8-environment-variables), [§10](#10-sample-credentials), [§22](#22-screenshots) | ✅ (screenshots pending capture) |

---

## 7. Getting Started

### Option A — Docker (recommended, matches the assignment's "start with `docker compose up`")

```bash
git clone https://github.com/ayushks404/queue-system.git
cd queue-system
docker compose up
```

This starts five containers: `postgres`, `redis`, `backend` (:3000), `worker` (background jobs, no exposed port), and `frontend` (:80). The backend waits on Postgres/Redis health checks before starting; the worker waits on the backend's health check. No manual migration step is needed — Prisma migrations run as part of the backend image's start command (`npx prisma migrate deploy && node dist/index.js`).

Open **http://localhost** for the app and **http://localhost:3000/api/docs** for the Swagger UI.

> An **admin** account is provisioned automatically on backend startup from `ADMIN_EMAIL` / `ADMIN_PASSWORD` (defaults below) — no seed command needed. See [§10](#10-sample-credentials) for staff and customer test accounts.

### Option B — Local development (without Docker)

Requires Node.js 20+, a local PostgreSQL 16 instance and a local Redis 7 instance.

```bash
# Backend
cd backend
cp .env.example .env        # edit DATABASE_URL / REDIS_* if not using the defaults below
npm install
npx prisma migrate deploy
npm run dev                  # API on :3000 — auto-provisions the admin account on boot
npm run worker                # in a second terminal — background jobs won't run without this

# Frontend
cd frontend
npm install
npm run dev                  # UI on :5173, proxies /api and /socket.io to :3000
```

The frontend has no required env vars in dev — Vite proxies `/api` and `/socket.io` to `localhost:3000` (see `vite.config.ts`); in Docker, nginx (`frontend/nginx.conf`) does the equivalent proxying to the `backend` service. In production (§9), the frontend instead reads `VITE_API_URL` and `VITE_SOCKET_URL` at build time.

---

## 8. Environment Variables

### `backend/.env`

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `3000` | Backend HTTP port |
| `DATABASE_URL` | `postgresql://postgres:postgres@127.0.0.1:5432/queue_db?schema=public` | Postgres connection string |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Takes precedence over `REDIS_HOST`/`REDIS_PORT` if set |
| `REDIS_HOST` / `REDIS_PORT` | `127.0.0.1` / `6379` | Used if `REDIS_URL` is not set |
| `FRONTEND_URL` | `http://localhost:5173` | Used for CORS origin allow-listing |
| `JWT_SECRET` | — | Signs access + refresh tokens; set a real secret outside local dev |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | `admin@queue.local` / `AdminPassword123!` | Read on every backend boot (`ensureAdminSeeded()`) — this is the only way an admin account gets created |

### `frontend/.env` *(production builds only)*

| Variable | Notes |
|---|---|
| `VITE_API_URL` | Backend base URL, baked in at build time |
| `VITE_SOCKET_URL` | Socket.IO server URL, baked in at build time |

---

## 9. Live Deployment

| Service | URL |
|---|---|
| Frontend (app) | https://queue-frontend-ty00.onrender.com |
| Backend (API + Swagger docs) | https://queue-backend-t30v.onrender.com/api/docs |
| Backend health check | https://queue-backend-t30v.onrender.com/health |

Deployed from the `render.yaml` Blueprint at the repo root: `queue-db` (Postgres), `queue-redis` (Key Value), `queue-backend` (Docker web service), **`queue-worker`** (a genuinely separate Render Background Worker service running `node dist/worker.js`), and `queue-frontend` (static site). Background job behavior is identical to the Docker Compose topology — same process, same schedule, just a different host. See [§25](#25-deployment) for the full blueprint breakdown.

---

## 10. Sample Credentials

All accounts below exist on the live deployment (§9) and in Docker Compose once seeded. Staff accounts are **not** self-registerable — registration always creates a `CUSTOMER` (see [§19](#19-security), Security); these were created by registering normally and then promoted to `STAFF` by an admin via `PATCH /api/admin/users/:id/role`, demonstrating the role-based access control working as designed rather than being bypassed for convenience.

| Role | Name | Email | Password | Dashboard / Access |
|---|---|---|---|---|
| Admin | System Admin | `admin@queue.local` | `AdminPassword123!` | Full admin control — branches, services, resources, schedules, holidays, analytics & reports |
| Staff | Dr. Sarah Jenkins | `staff1@queue.local` | `StaffPassword123!` | Staff queue management, calling next patient, status transitions |
| Staff | Dr. Rajesh Sharma | `staff2@queue.local` | `StaffPassword123!` | Staff queue management, calling next patient, status transitions |
| Staff | Nurse Emily Chen | `staff3@queue.local` | `StaffPassword123!` | Staff queue management, calling next patient, status transitions |
| Customer | John Doe | `customer1@queue.local` | `CustomerPassword123!` | Appointment booking, live queue ticket tracking, notifications |
| Customer | Jane Smith | `customer2@queue.local` | `CustomerPassword123!` | Appointment booking, live queue ticket tracking, notifications |
| Customer | Robert Taylor | `customer3@queue.local` | `CustomerPassword123!` | Appointment booking, live queue ticket tracking, notifications |

---

## 11. Roles & Permissions

```mermaid
flowchart LR
    subgraph CUSTOMER["👤 Customer"]
        C1["Book / cancel / reschedule<br/>own appointments"]
        C2["Join waitlist"]
        C3["View own history +<br/>live queue position"]
    end
    subgraph STAFF["🧑‍⚕️ Staff"]
        S1["Check-in customers"]
        S2["Call next / skip / complete"]
        S3["Add walk-ins, mark no-show"]
    end
    subgraph ADMIN["🛡️ Admin"]
        A1["CRUD branches, services, resources"]
        A2["Schedules & holidays"]
        A3["Promote users to STAFF/ADMIN"]
        A4["View analytics & reports"]
    end

    Auth(("JWT + RBAC<br/>requireRole() middleware"))
    CUSTOMER -.->|"self-registration"| Auth
    STAFF -.->|"provisioned by an Admin"| Auth
    ADMIN -.->|"provisioned by an Admin"| Auth
```

Self-service registration **always** creates a `CUSTOMER`; `STAFF`/`ADMIN` accounts can only be provisioned by an existing admin (see [§10](#10-sample-credentials) for how the sample staff accounts were created this way). Every protected route checks both "is this a valid token" **and** "is this role allowed here," plus ownership checks where relevant (e.g. a customer can only see/cancel their own appointments) — full detail in [§19 Security](#19-security).

---

## 12. Database Schema

Core entities (see `backend/prisma/schema.prisma` for the full definitions, including indexes):

`users` · `branches` · `business_hours` · `holidays` · `services` · `resources` · `service_resources` · `appointments` · `appointment_resources` · `reservations` · `waitlist` · `queue_entries` · `notifications` · `audit_logs`

```mermaid
erDiagram
    USERS ||--o{ APPOINTMENTS : books
    USERS ||--o{ RESERVATIONS : holds
    USERS ||--o{ WAITLIST : joins
    USERS ||--o{ NOTIFICATIONS : receives

    BRANCHES ||--o{ BUSINESS_HOURS : has
    BRANCHES ||--o{ HOLIDAYS : has
    BRANCHES ||--o{ RESOURCES : has
    BRANCHES ||--o{ APPOINTMENTS : hosts
    BRANCHES ||--o{ QUEUE_ENTRIES : has

    SERVICES ||--o{ SERVICE_RESOURCES : requires
    SERVICES ||--o{ APPOINTMENTS : booked_for
    SERVICES ||--o{ RESERVATIONS : held_for
    SERVICES ||--o{ WAITLIST : requested_for

    APPOINTMENTS ||--o{ APPOINTMENT_RESOURCES : allocates
    APPOINTMENTS ||--o{ QUEUE_ENTRIES : linked_to
    APPOINTMENTS ||--o{ AUDIT_LOGS : logs
    RESOURCES ||--o{ APPOINTMENT_RESOURCES : assigned_to

    USERS {
        uuid id PK
        string email UK
        string role
    }
    APPOINTMENTS {
        uuid id PK
        string appointment_number UK
        uuid user_id FK
        uuid branch_id FK
        uuid service_id FK
        string status
        string idempotency_key
    }
    RESERVATIONS {
        uuid id PK
        uuid branch_id FK
        uuid service_id FK
        date slot_date
        string slot_time
        timestamp expires_at
    }
    QUEUE_ENTRIES {
        uuid id PK
        uuid branch_id FK
        uuid appointment_id FK
        string priority
        int priority_rank
        int queue_number
        string status
    }
```

Notable constraints:
- `appointments.appointment_number` — `UNIQUE`
- `(appointments.user_id, appointments.idempotency_key)` — composite `UNIQUE`, enables safe retries (see [§14.2](#142-idempotency))
- `queue_entries` has a covering index on `(branch_id, status, priority_rank DESC, created_at ASC)` for O(index scan) "call next" lookups
- `appointment_resources` has a `UNIQUE (resource_id, appointment_id)` constraint preventing a resource from being double-booked for the same appointment record

---

## 13. REST API

Base path `/api`, routers: `/auth`, `/admin/users`, `/branches`, `/services`, `/resources`, `/availability`, `/reservations`, `/appointments`, `/waitlist`, `/queue`, `/notifications`, `/reports`.

Full interactive documentation (all request/response schemas, try-it-out) is served at **`/api/docs`** (Swagger UI) with the raw spec at `/api/docs/openapi.json` — this README doesn't duplicate it. On the live deployment: https://queue-backend-t30v.onrender.com/api/docs

All errors follow one shape:
```json
{ "success": false, "error": { "code": "SLOT_UNAVAILABLE", "message": "The selected appointment slot is no longer available." } }
```

---

## 14. Core Business Logic

### 14.1 Booking flow & concurrency

Booking is two steps: **hold**, then **confirm**.

1. `POST /api/reservations` — creates a 5-minute hold on a slot.
2. `POST /api/appointments` (confirm) — converts a live hold into a real `appointments` row.

Both run inside a Postgres transaction guarded by `pg_advisory_xact_lock(hashtext(branch_id || service_id || date || time))`. Because services can have `capacity > 1`, there's no single-row `UNIQUE` constraint to lean on for slot exclusivity — instead, every concurrent request for the *same* branch/service/date/time slot is serialized by the advisory lock, then capacity is counted (`active appointments + active reservations`) against `service.capacity` before a new reservation is allowed. One request wins the lock first, commits, and releases the slot; every other concurrent request re-reads the now-updated count and gets `SLOT_UNAVAILABLE`. This is covered by a dedicated test that fires the same request concurrently in a loop and asserts exactly one success per run (`backend/src/modules/booking/booking.test.ts`).

Resource assignment at confirm time uses `SELECT ... FOR UPDATE SKIP LOCKED` per required resource type, so two simultaneous confirmations needing the same resource type never assign the same physical resource, and neither request blocks waiting for the other if an alternative resource is free.

### 14.2 Idempotency

`POST /api/appointments` accepts an `Idempotency-Key`. On confirm, the backend first checks for an existing appointment with that `(user_id, idempotency_key)` pair; if found, it returns the existing appointment instead of creating a new one. This is backed by a composite `UNIQUE` constraint, so even a race between two identical retries can only ever produce one row. `appointment_number` collisions (a random 6-digit suffix) are retried up to twice inside the same transaction on a Postgres `P2002` conflict before giving up.

### 14.3 Reservation expiry

Reservations carry `expires_at` (hold time + 5 minutes). Expiry is enforced two ways: lazily (any new reservation attempt for that slot first deletes expired rows for that exact slot before counting capacity) and actively (a periodic sweep on the worker process checks the whole table every 30 seconds and releases expired holds). The frontend shows a countdown (`SlotHoldTimer.tsx`) purely for UX — the backend never trusts the client's clock.

### 14.4 Waitlist ordering & eligibility

When a slot frees up (cancellation or no-show), `processWaitlistForSlot` runs:
1. Prefer the oldest `WAITING` entry whose `requested_time` matches the freed slot time, or is `null` ("any time").
2. If none matches, fall back to strict FIFO by `created_at` for that branch/service/date, regardless of requested time.

A matching entry gets a fresh reservation (10-minute hold, longer than the normal 5 minutes since the customer isn't actively in the booking flow) and an in-app notification. Position and ETA are computed on read (`GET /waitlist/:id/position`), not stored — so there's no stale "position" column to keep in sync. Reservation expiry additionally re-runs this matching step when the *expiring* reservation itself belonged to a waitlist entry, cascading to the next eligible person in line.

### 14.5 Queue prioritization & no-shows

Walk-in queue entries have a `priority` (`NORMAL` / `PRIORITY` / `EMERGENCY`) mapped to a numeric `priority_rank` (1 / 2 / 3) at creation time. "Call next" always orders by `priority_rank DESC, created_at ASC` — highest priority tier first, FIFO within a tier. This is a plain index-backed sort, not a separate scheduling algorithm, which keeps it easy to reason about under concurrent staff actions.

No-show handling (staff-triggered or automatic): status → `NO_SHOW`, timestamp recorded, any assigned resource released, an audit log entry written, and waitlist processing triggered for that slot — the same code path a cancellation uses.

### 14.6 Appointment lifecycle

```mermaid
stateDiagram-v2
    [*] --> CONFIRMED : reservation confirmed
    CONFIRMED --> CHECKED_IN
    CHECKED_IN --> IN_PROGRESS
    IN_PROGRESS --> COMPLETED
    CONFIRMED --> CANCELLED
    CONFIRMED --> NO_SHOW
    CHECKED_IN --> NO_SHOW
    COMPLETED --> [*]
    CANCELLED --> [*]
    NO_SHOW --> [*]
```

Enforced centrally in `appointmentStateMachine.ts` — every status-changing endpoint calls `canTransition(from, to)` before writing, so an invalid jump (e.g. `COMPLETED → CHECKED_IN`) is rejected regardless of which route triggered it. There is no `PENDING` state — reservations are the "not yet confirmed" stage; once an appointment row exists it's already `CONFIRMED`.

### 14.7 Rescheduling & cancellation

- **`PATCH /api/appointments/:id/cancel`** — only valid while the appointment is still `CONFIRMED` (matching the state diagram above). Sets status to `CANCELLED`, writes an audit log entry with the cancellation reason, invalidates the availability cache for that slot, and publishes `appointment.cancelled`, which triggers waitlist processing for the freed slot.
- **`PATCH /api/appointments/:id/reschedule`** — also requires `CONFIRMED`. Acquires the same `pg_advisory_xact_lock` used for fresh bookings on the *new* slot, re-checks capacity and re-assigns required resources with `SELECT ... FOR UPDATE SKIP LOCKED` (so a reschedule can't collide with a concurrent booking or another reschedule targeting the same slot), then updates the appointment in place — same `id` and `appointment_number`, new date/time/branch/service — and writes an `APPOINTMENT_RESCHEDULED` audit log entry, preserving full history. Both the old and new slot's availability caches are invalidated.

---

## 15. Application & Data Flow

### 15.1 Booking flow (with concurrency handling)

```mermaid
sequenceDiagram
    actor C1 as Customer A
    actor C2 as Customer B
    participant API as Backend API
    participant DB as PostgreSQL<br/>(advisory lock)
    participant R as Redis<br/>(availability cache)

    C1->>API: GET /api/availability
    API->>R: check cache
    R-->>API: miss
    API->>DB: query open slots
    API-->>C1: available slots
    API->>R: cache (30s TTL)

    par Simultaneous hold attempts
        C1->>API: POST /api/reservations (slot X)
        C2->>API: POST /api/reservations (slot X)
    end

    API->>DB: pg_advisory_xact_lock(branch+service+date+time)
    Note over DB: Requests serialized —<br/>one acquires the lock first
    DB-->>API: C1 wins lock, capacity available
    API->>DB: create reservation, release lock
    API-->>C1: 201 — 5-minute hold + countdown

    DB-->>API: C2 acquires lock, capacity now full
    API-->>C2: 409 SLOT_UNAVAILABLE

    C1->>API: POST /api/appointments (confirm, Idempotency-Key)
    API->>DB: SELECT ... FOR UPDATE SKIP LOCKED (resource assignment)
    API->>DB: create appointment, release reservation
    API-->>C1: 201 — appointment number (APT-2026-XXXXXX)
    API->>R: invalidate availability cache for that slot
```

### 15.2 Real-time queue & walk-in flow

```mermaid
flowchart LR
    A["Staff adds walk-in<br/>name, phone, service, priority"] --> B["Queue entry created<br/>priority_rank assigned"]
    B --> C{"Staff: Call Next"}
    C --> D["Highest priority_rank,<br/>oldest created_at first"]
    D --> E["queue:called emitted<br/>→ branch:&lt;id&gt; room"]
    E --> F["Customer's screen updates<br/>live via Socket.IO"]
    D --> G["Staff: Check-in / Start / Complete"]
    G --> H["queue:updated + appointment:updated<br/>emitted to branch room"]
    G --> I{"No-show?"}
    I -->|"yes"| J["Status → NO_SHOW<br/>resource released<br/>audit log written"]
    J --> K["Waitlist processing triggered<br/>for the freed slot"]
    K --> L["Next eligible waitlist entry<br/>gets a reservation + notification"]
    L --> M["notification:new emitted<br/>→ user:&lt;id&gt; room"]
```

### 15.3 Notification flow

```mermaid
flowchart LR
    T1["Appointment confirmed"] --> N["In-app notification created"]
    T2["Cancelled / rescheduled"] --> N
    T3["Waitlist slot offered"] --> N
    T4["Queue position changes"] --> N
    T5["Customer called"] --> N
    T6["Appointment completed"] --> N
    T7["5-min reminder sweep<br/>(background job)"] --> N
    N --> DB[("notifications table")]
    N -->|"notification:new"| Room["user:&lt;id&gt; Socket.IO room"]
    Room --> UI["NotificationDrawer.tsx<br/>updates without refresh"]
```

Email/SMS/push were listed as **optional** integrations in the assignment brief and are not implemented — every trigger above currently results in an in-app notification only (see [§23](#23-known-limitations)).

---

## 16. Real-Time Architecture

Socket.IO, JWT-authenticated on connect. Clients join a `branch:<id>` room (for queue/staff views) and are automatically placed in a `user:<id>` room (for personal notifications). Events emitted:

| Event | Room | When |
|---|---|---|
| `queue:updated` | `branch:<id>` | Queue entry created, checked in, called, skipped, cancelled or completed |
| `queue:called` | `branch:<id>` | Staff calls a specific customer |
| `appointment:updated` | `branch:<id>` | Any appointment status change |
| `notification:new` | `user:<id>` | A new in-app notification for that user |

The frontend's `SocketContext` re-establishes the connection with the current access token if the token changes (e.g. after a silent refresh), and Socket.IO's own client handles reconnection with backoff — no custom reconnect logic was needed on top of that.

---

## 17. Background Jobs

Reservation expiry sweeping, waitlist processing, and appointment reminders all run inside **one shared worker process** (`backend/src/worker.ts`) — the same code, unchanged, in every environment:

| Environment | How the worker runs |
|---|---|
| Docker Compose (local dev, §7 Option A) | A separate `worker` container, its own process, sharing the same Redis connection as the API for BullMQ |
| Render (§9, §25) | A separate Render **Background Worker** service (`queue-worker`, same Docker image as the backend, command overridden to `node dist/worker.js`) |
| Local dev without Docker (§7 Option B) | `npm run worker` in a second terminal, alongside `npm run dev` |

| Job | Trigger | Purpose |
|---|---|---|
| Reservation expiry sweep | Every 30s + on boot | Deletes reservations past `expires_at` that a lazy check didn't already catch; cascades to waitlist matching if the expiring reservation itself was waitlist-held |
| Waitlist processing | Event-driven (cancellation, no-show) via BullMQ queue | Runs [§14.4](#144-waitlist-ordering--eligibility)'s matching algorithm and reserves + notifies the next eligible customer |
| Appointment reminders | Every 5 minutes + on boot | Sends an in-app reminder notification for upcoming confirmed appointments not yet reminded (`reminder_sent_at` gate) |

Running these jobs somewhere is required — it isn't optional background noise. Both deployment targets run a genuinely isolated worker process; nothing runs "inline" inside the API's request-handling process in either environment.

---

## 18. Caching Strategy

Redis caches `GET /api/availability` responses (30-second TTL, keyed by `branch_id:service_id:date`). Any write that could change availability for that key — new reservation, cancellation, reschedule, no-show — actively invalidates it via a `redis.keys()` pattern delete rather than waiting out the TTL, so the 30s window is a ceiling on staleness under normal load, not the expected staleness. Refresh-token revocation also lives in Redis (`revoked:<token>`, 7-day TTL matching the refresh token's own lifetime).

---

## 19. Security

- Passwords hashed with bcrypt.
- JWT access + refresh tokens; refresh tokens are revocable (Redis-backed blocklist) and rejected on reuse after logout.
- `requireRole()` middleware for RBAC (`CUSTOMER` / `STAFF` / `ADMIN`) on top of the auth middleware — every protected route checks both "is this a valid token" and "is this role allowed here."
- Self-service registration always creates a `CUSTOMER`; `STAFF`/`ADMIN` accounts can only be provisioned by an existing admin via `PATCH /api/admin/users/:id/role` — see [§10](#10-sample-credentials) for how the sample staff accounts were created this way, not by bypassing the restriction.
- Ownership checks alongside role checks (e.g. a customer can only see/cancel their own appointments) to prevent IDOR.
- Request validation via Zod schemas on all mutating routes.
- Rate limiting (`express-rate-limit`) on `/auth`, reservations, walk-in creation, and booking confirmation.
- CORS restricted to an explicit origin allow-list, matched via a strict regex (not a `startsWith` prefix check, which would let a lookalike hostname like `localhost.evil.com` through).
- Secrets (`JWT_SECRET`, DB/Redis credentials, admin password) read from environment variables only, never hardcoded; `.env` is gitignored, `.env.example` documents the shape.

---

## 20. Testing

**Backend** — `cd backend && npm run test` (23 files, `node --test`, requires a running Postgres + Redis). Covers registration, login, refresh/logout/revocation, RBAC, the full CRUD catalog (branches/services/resources/schedules), the availability engine, booking including a dedicated concurrent-booking test (`booking.test.ts`), idempotency, reservation expiry, the appointment lifecycle state machine, cancellation, rescheduling, waitlist matching, queue operations, no-show handling, notifications, reports, and the event bus.

**Frontend** — `cd frontend && npm run test` (Vitest + React Testing Library, mocked API client and socket context — no real backend needed to run these). Covers the login form, the booking wizard's availability/slot-selection/confirm steps including a `SLOT_UNAVAILABLE` error case, the customer dashboard's cancel/reschedule actions, and the staff dashboard's queue list and call-next action. This is intentionally a small, targeted set (not full coverage of every component) — see [§23](#23-known-limitations).

---

## 21. CI/CD Pipeline

A GitHub Actions workflow (`.github/workflows/ci.yml`) runs on every push and pull request to `main`:

```mermaid
flowchart LR
    A["backend-test<br/>Postgres + Redis services<br/>prisma migrate deploy → npm test → npm build"] --> C["docker-build<br/>builds backend + frontend images"]
    B["frontend-test<br/>npm test → npm build"] --> C
    C --> D{"push to main?"}
    D -->|"yes"| E["deploy<br/>curls Render deploy hooks:<br/>backend · worker · frontend"]
    D -->|"no (PR)"| F["Stops after build<br/>— no deploy"]
```

- `backend-test` spins up real `postgres:16` and `redis:7` service containers, runs Prisma migrations against them, then the full `node --test` suite, then a production build.
- `frontend-test` runs the Vitest suite and a Vite build.
- `docker-build` builds both the `backend` and `frontend` Docker images to catch Dockerfile regressions independent of the Render build.
- `deploy` only runs on a push to `main` (not on pull requests) and only fires each `curl` if the corresponding `RENDER_DEPLOY_HOOK_*` secret is configured — so the pipeline degrades gracefully to "tested and built" in forks or environments without deploy hooks set up.

---

## 22. Screenshots

> Screenshots below are captured from the live deployment (§9) using the sample accounts (§10).

| | |
|---|---|
| Booking flow — branch → service → date/time → confirm | _screenshot pending_ |
| Live queue position update (real-time, two tabs) | _screenshot pending_ |
| Staff — current queue & call next | _screenshot pending_ |
| Admin — analytics & reports | _screenshot pending_ |
| Swagger UI (`/api/docs`) | _screenshot pending_ |

---

## 23. Known Limitations

- **Single-replica assumption.** The event bus (`events/bus.ts`) publishes over Redis pub/sub so the API and worker see each other's events, but individual event handlers aren't deduplicated by event ID — if the backend were scaled to multiple replicas, some side effects could run more than once. Fine at the current single-instance topology; would need an idempotency marker per event ID before scaling out.
- **Rate limiting is per-instance, in-memory.** `express-rate-limit` uses its default in-memory store, not a shared Redis store — limits reset per backend replica rather than being enforced globally. Same caveat as above: not an issue at one replica.
- **Availability cache invalidation uses `redis.keys()`.** Fine at this data volume; `KEYS` is a blocking O(n) scan and would need to become a maintained index (or `SCAN`) at much larger key counts.
- **Rescheduling doesn't re-trigger waitlist matching for the vacated slot.** Cancelling and no-showing both queue a waitlist-matching job for the freed slot; rescheduling invalidates the availability cache for the old slot (so it correctly shows as open again) but does not itself enqueue a waitlist match for that now-empty slot. A waitlisted customer would need a subsequent cancellation/no-show on that exact slot, or to simply re-check availability, to get in.
- **Frontend test coverage is a representative slice, not exhaustive.** It covers one flow through each required area (login, availability, booking, cancellation, rescheduling, queue, error states) rather than every component and edge case.
- **Notifications are in-app only.** Email/SMS/push were listed as optional in the assignment and weren't implemented.
- **No pagination on the analytics/reports endpoints** — they return full aggregates for the requested filter/date range, not paged results.
- **Analytics are numeric summaries, not charts.** The admin analytics tab shows aggregate figures (totals, averages) rather than rendered bar/line/pie charts. The assignment lists charts as recommended, not required.
- **CI's deploy stage is opt-in.** The GitHub Actions `deploy` job only fires a Render deploy hook if the matching `RENDER_DEPLOY_HOOK_*` repository secret exists; without those secrets configured, CI still fully tests and builds, it simply doesn't push a live deploy.

---

## 24. Git History

Commits are structured by feature area (setup, authentication, availability engine, booking, waitlist, queue, real-time updates, tests, Docker, deployment fixes) rather than pushed as a single commit — see the repository's commit history for the full log.

---

## 25. Deployment

### Docker Compose (local / self-hosted)

```bash
docker compose up            # foreground
docker compose up -d         # detached
docker compose down          # stop (add -v to also drop the postgres/redis volumes)
```

`docker-compose.yml` builds `frontend` (nginx-served static build) and `backend`/`worker` (same image, different start command) from their respective `Dockerfile`s, and wires health-check-gated `depends_on` so Postgres/Redis are ready before the backend starts, and the backend is ready before the worker and frontend start. The worker is a genuinely separate container here.

### Render (live deployment, §9)

Deployed from the `render.yaml` Blueprint at the repo root:

| Render resource | Type | Role |
|---|---|---|
| `queue-db` | Postgres (free) | Primary datastore |
| `queue-redis` | Key Value (free) | Cache, BullMQ, pub/sub, token blocklist |
| `queue-backend` | Web service (Docker) | REST API + Socket.IO, health check on `/health` |
| `queue-worker` | Background Worker (Docker) | Same image as `queue-backend`, command overridden to `node dist/worker.js` — a genuinely standalone process, not an inline flag |
| `queue-frontend` | Static site | Vite production build |

`FRONTEND_URL` (backend) and `VITE_API_URL` / `VITE_SOCKET_URL` (frontend, baked in at build time) are set to each other's live Render URLs to make CORS and API/socket calls resolve correctly between the deployed services. The GitHub Actions `deploy` job (§21) triggers fresh deploys of `queue-backend`, `queue-worker` and `queue-frontend` independently via their Render deploy hooks whenever `main` is updated.

---

<div align="center">

Built for the **Smart Appointment & Queue Management System** assignment — see [§6](#6-requirements-coverage) for the full requirements traceability matrix.

</div>
