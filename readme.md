# Smart Appointment & Queue Management System

A multi-branch appointment booking and walk-in queue platform for businesses with limited
staff, resources and appointment capacity. Built for the "Smart Appointment & Queue Management
System" assignment: scheduling, concurrency-safe booking, real-time queue updates, waitlists,
and role-based dashboards for customers, staff and admins.

---

## 1. Tech Stack

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
| Containerization | Docker, Docker Compose |

### Architecture

```
frontend (Vite, :5173 dev / :80 in Docker)
   │  REST (/api/*) + Socket.IO
   ▼
backend (Express, :3000)
   │
   ├─ modules/{auth,catalog,booking,waitlist,queue,notifications,reports}
   │     each module owns its own controller/service; cross-module calls only
   │     go through another module's service layer or the in-process event bus
   │
   ├─ events/bus.ts        in-memory EventEmitter, mirrored over Redis pub/sub
   │                       so the backend and worker process see the same events
   │
   ├─ realtime/socket.ts   Socket.IO server, branch rooms + per-user rooms
   │
   └─ queues/*.ts          BullMQ job definitions, run by a separate worker process
         │
         ▼
   worker.ts (separate Node process, same image, different container)
      - reservation expiry sweeper
      - waitlist-slot processor
      - appointment reminder sender

Postgres (persistent data)      Redis (cache, BullMQ, pub/sub, token revocation)
```

The backend is the sole authority for availability and booking — the frontend never decides
whether a slot is free; it only reflects what `GET /api/availability` and the booking endpoints
return.

---

## 2. Getting Started

### Option A — Docker (recommended, matches the assignment's "start with `docker compose up`")

```bash
git clone https://github.com/ayushks404/queue-system.git
cd queue-system
docker compose up
```

This starts five containers: `postgres`, `redis`, `backend` (:3000), `worker` (background jobs,
no exposed port), and `frontend` (:80). The backend waits on Postgres/Redis health checks before
starting; the worker waits on the backend's health check. No manual migration step is needed —
Prisma migrations run as part of the backend image's start sequence.

Open **http://localhost** for the app and **http://localhost:3000/api/docs** for the Swagger UI.

Default seeded admin (overridable via env, see below): `admin@queue.local` / `AdminPassword123!`.

### Option B — Local development (without Docker)

Requires Node.js 20+, a local PostgreSQL 16 instance and a local Redis 7 instance.

```bash
# Backend
cd backend
cp .env.example .env        # edit DATABASE_URL / REDIS_* if not using the defaults below
npm install
npx prisma migrate deploy
npm run seed:admin           # creates the admin account from ADMIN_EMAIL / ADMIN_PASSWORD
npm run dev                  # API on :3000
npm run worker                # in a second terminal — background jobs won't run without this

# Frontend
cd frontend
npm install
npm run dev                  # UI on :5173, proxies /api and /socket.io to :3000
```

### Environment Variables (`backend/.env`)

| Variable | Default | Notes |
|---|---|---|
| `PORT` | `3000` | Backend HTTP port |
| `DATABASE_URL` | `postgresql://postgres:postgres@127.0.0.1:5432/queue_db?schema=public` | Postgres connection string |
| `REDIS_URL` | `redis://127.0.0.1:6379` | Takes precedence over `REDIS_HOST`/`REDIS_PORT` if set |
| `REDIS_HOST` / `REDIS_PORT` | `127.0.0.1` / `6379` | Used if `REDIS_URL` is not set |
| `FRONTEND_URL` | `http://localhost:5173` | Used for CORS origin allow-listing |
| `JWT_SECRET` | — | Signs access + refresh tokens; set a real secret outside local dev |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | `admin@queue.local` / `AdminPassword123!` | Read by the admin seed script — this is the only way an admin account gets created |

The frontend has no required env vars in dev — Vite proxies `/api` and `/socket.io` to
`localhost:3000` (see `vite.config.ts`); in Docker, nginx (`frontend/nginx.conf`) does the
equivalent proxying to the `backend` service.

---

## 3. Database Schema

Core entities (see `backend/prisma/schema.prisma` for the full definitions, including indexes):

`users` · `branches` · `business_hours` · `holidays` · `services` · `resources` ·
`service_resources` · `appointments` · `appointment_resources` · `reservations` ·
`waitlist` · `queue_entries` · `notifications` · `audit_logs`

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
- `(appointments.user_id, appointments.idempotency_key)` — composite `UNIQUE`, enables safe
  retries (see §5)
- `queue_entries` has a covering index on `(branch_id, status, priority_rank DESC, created_at ASC)`
  for O(index scan) "call next" lookups
- `appointment_resources` has a `UNIQUE (resource_id, appointment_id)` constraint preventing a
  resource from being double-booked for the same appointment record

---

## 4. API

Base path `/api`, routers: `/auth`, `/admin/users`, `/branches`, `/services`, `/resources`,
`/availability`, `/reservations`, `/appointments`, `/waitlist`, `/queue`, `/notifications`,
`/reports`.

Full interactive documentation (all request/response schemas, try-it-out) is served at
**`/api/docs`** (Swagger UI) with the raw spec at `/api/docs/openapi.json` — this README doesn't
duplicate it.

All errors follow one shape:
```json
{ "success": false, "error": { "code": "SLOT_UNAVAILABLE", "message": "The selected appointment slot is no longer available." } }
```

---

## 5. Core Business Logic

### 5.1 Booking flow & concurrency

Booking is two steps: **hold**, then **confirm**.

1. `POST /api/reservations` — creates a 5-minute hold on a slot.
2. `POST /api/appointments` (confirm) — converts a live hold into a real `appointments` row.

Both run inside a Postgres transaction guarded by
`pg_advisory_xact_lock(hashtext(branch_id || service_id || date || time))`. Because services can
have `capacity > 1`, there's no single-row `UNIQUE` constraint to lean on for slot exclusivity —
instead, every concurrent request for the *same* branch/service/date/time slot is serialized by
the advisory lock, then capacity is counted (`active appointments + active reservations`) against
`service.capacity` before a new reservation is allowed. One request wins the lock first, commits,
and releases the slot; every other concurrent request re-reads the now-updated count and gets
`SLOT_UNAVAILABLE`. This is covered by a dedicated test that fires the same request concurrently
in a loop and asserts exactly one success per run (`backend/src/modules/booking/booking.test.ts`).

Resource assignment at confirm time uses `SELECT ... FOR UPDATE SKIP LOCKED` per required
resource type, so two simultaneous confirmations needing the same resource type never assign the
same physical resource, and neither request blocks waiting for the other if an alternative
resource is free.

### 5.2 Idempotency

`POST /api/appointments` accepts an `Idempotency-Key`. On confirm, the backend first checks for
an existing appointment with that `(user_id, idempotency_key)` pair; if found, it returns the
existing appointment instead of creating a new one. This is backed by a composite `UNIQUE`
constraint, so even a race between two identical retries can only ever produce one row.
`appointment_number` collisions (a random 6-digit suffix) are retried up to twice inside the same
transaction on a Postgres `P2002` conflict before giving up.

### 5.3 Reservation expiry

Reservations carry `expires_at` (hold time + 5 minutes). Expiry is enforced two ways: lazily
(any new reservation attempt for that slot first deletes expired rows for that exact slot before
counting capacity) and actively (the worker process sweeps expired reservations across the whole
table every 30 seconds and releases them). The frontend shows a countdown (`SlotHoldTimer.tsx`)
purely for UX — the backend never trusts the client's clock.

### 5.4 Waitlist ordering & eligibility

When a slot frees up (cancellation or a reservation expiring), `processWaitlistForSlot` runs:
1. Prefer the oldest `WAITING` entry whose `requested_time` matches the freed slot time, or is
   `null` ("any time").
2. If none matches, fall back to strict FIFO by `created_at` for that branch/service/date,
   regardless of requested time.

A matching entry gets a fresh reservation (10-minute hold, longer than the normal 5 minutes since
the customer isn't actively in the booking flow) and an in-app notification. Position and ETA are
computed on read (`GET /waitlist/:id/position`), not stored — so there's no stale "position"
column to keep in sync.

### 5.5 Queue prioritization & no-shows

Walk-in queue entries have a `priority` (`NORMAL` / `PRIORITY` / `EMERGENCY`) mapped to a numeric
`priority_rank` (1 / 2 / 3) at creation time. "Call next" always orders by
`priority_rank DESC, created_at ASC` — highest priority tier first, FIFO within a tier. This is a
plain index-backed sort, not a separate scheduling algorithm, which keeps it easy to reason about
under concurrent staff actions.

No-show handling (staff-triggered or automatic): status → `NO_SHOW`, timestamp recorded, any
assigned resource released, an audit log entry written, and waitlist processing triggered for
that slot — the same code path a cancellation uses.

### 5.6 Appointment lifecycle

```
CONFIRMED → CHECKED_IN → IN_PROGRESS → COMPLETED
CONFIRMED → CANCELLED
CONFIRMED → NO_SHOW
CHECKED_IN → NO_SHOW
```
Enforced centrally in `appointmentStateMachine.ts` — every status-changing endpoint calls
`canTransition(from, to)` before writing, so an invalid jump (e.g. `COMPLETED → CHECKED_IN`) is
rejected regardless of which route triggered it. There is no `PENDING` state — reservations are
the "not yet confirmed" stage; once an appointment row exists it's already `CONFIRMED`.

---

## 6. Real-Time Architecture

Socket.IO, JWT-authenticated on connect. Clients join a `branch:<id>` room (for queue/staff views)
and are automatically placed in a `user:<id>` room (for personal notifications). Events emitted:

| Event | Room | When |
|---|---|---|
| `queue:updated` | `branch:<id>` | Queue entry created, checked in, called, skipped, cancelled or completed |
| `queue:called` | `branch:<id>` | Staff calls a specific customer |
| `appointment:updated` | `branch:<id>` | Any appointment status change |
| `notification:new` | `user:<id>` | A new in-app notification for that user |

The frontend's `SocketContext` re-establishes the connection with the current access token if the
token changes (e.g. after a silent refresh), and Socket.IO's own client handles reconnection with
backoff — no custom reconnect logic was needed on top of that.

---

## 7. Background Jobs

Run by a separate `worker` process (`backend/src/worker.ts`), sharing the same Redis connection
as the API for BullMQ:

| Job | Trigger | Purpose |
|---|---|---|
| Reservation expiry sweep | Every 30s + on boot | Deletes reservations past `expires_at` that a lazy check didn't already catch |
| Waitlist processing | Event-driven (cancellation, no-show, reservation expiry) via BullMQ queue | Runs §5.4's matching algorithm and reserves + notifies the next eligible customer |
| Appointment reminders | Every 5 minutes + on boot | Sends an in-app reminder notification for upcoming confirmed appointments not yet reminded (`reminder_sent_at` gate) |

Running the worker is required for these to happen at all — it isn't optional background noise;
`docker-compose.yml` runs it as its own container, and local dev needs `npm run worker` running
alongside `npm run dev`.

---

## 8. Caching

Redis caches `GET /api/availability` responses (30-second TTL, keyed by
`branch_id:service_id:date`). Any write that could change availability for that key — new
reservation, cancellation, reschedule, no-show — actively invalidates it via a `redis.keys()`
pattern delete rather than waiting out the TTL, so the 30s window is a ceiling on staleness under
normal load, not the expected staleness. Refresh-token revocation also lives in Redis
(`revoked:<token>`, 7-day TTL matching the refresh token's own lifetime).

---

## 9. Security

- Passwords hashed with bcrypt.
- JWT access + refresh tokens; refresh tokens are revocable (Redis-backed blocklist) and rejected
  on reuse after logout.
- `requireRole()` middleware for RBAC (`CUSTOMER` / `STAFF` / `ADMIN`) on top of the auth
  middleware — every protected route checks both "is this a valid token" and "is this role
  allowed here."
- Ownership checks alongside role checks (e.g. a customer can only see/cancel their own
  appointments) to prevent IDOR.
- Request validation via Zod schemas on all mutating routes.
- Rate limiting (`express-rate-limit`) on `/auth`, reservations, walk-in creation, and booking
  confirmation.
- CORS restricted to an explicit origin allow-list, matched via a strict regex (not a
  `startsWith` prefix check, which would let a lookalike hostname like
  `localhost.evil.com` through).
- Secrets (`JWT_SECRET`, DB/Redis credentials, admin password) read from environment variables
  only, never hardcoded; `.env` is gitignored, `.env.example` documents the shape.

---

## 10. Testing

**Backend** — `cd backend && npm run test` (23 files, `node --test`, requires a running Postgres +
Redis). Covers registration, login, refresh/logout/revocation, RBAC, the full CRUD catalog
(branches/services/resources/schedules), the availability engine, booking including a dedicated
concurrent-booking test (`booking.test.ts`), idempotency, reservation expiry, the appointment
lifecycle state machine, cancellation, rescheduling, waitlist matching, queue operations, no-show
handling, notifications, reports, and the event bus.

**Frontend** — `cd frontend && npm run test` (Vitest + React Testing Library, mocked API client
and socket context — no real backend needed to run these). Covers the login form, the booking
wizard's availability/slot-selection/confirm steps including a `SLOT_UNAVAILABLE` error case, the
customer dashboard's cancel/reschedule actions, and the staff dashboard's queue list and
call-next action. This is intentionally a small, targeted set (not full coverage of every
component) — see §11.

---

## 11. Known Limitations

- **Single-replica assumption.** The event bus (`events/bus.ts`) publishes over Redis pub/sub so
  the API and worker see each other's events, but individual event handlers aren't deduplicated
  by event ID — if the backend were scaled to multiple replicas, some side effects could run more
  than once. Fine at the current single-instance `docker-compose.yml` topology; would need an
  idempotency marker per event ID before scaling out.
- **Rate limiting is per-instance, in-memory.** `express-rate-limit` uses its default in-memory
  store, not a shared Redis store — limits reset per backend replica rather than being enforced
  globally. Same caveat as above: not an issue at one replica.
- **Availability cache invalidation uses `redis.keys()`.** Fine at this data volume; `KEYS` is a
  blocking O(n) scan and would need to become a maintained index (or `SCAN`) at much larger key
  counts.
- **Frontend test coverage is a representative slice, not exhaustive.** It covers one flow through
  each required area (login, availability, booking, cancellation, rescheduling, queue, error
  states) rather than every component and edge case.
- **Notifications are in-app only.** Email/SMS/push were listed as optional in the assignment and
  weren't implemented.
- **No pagination on the analytics/reports endpoints** — they return full aggregates for the
  requested filter/date range, not paged results.

---

## 12. Deployment

```bash
docker compose up            # foreground
docker compose up -d         # detached
docker compose down          # stop (add -v to also drop the postgres/redis volumes)
```

`docker-compose.yml` builds `frontend` (nginx-served static build) and `backend`/`worker` (same
image, different start command) from their respective `Dockerfile`s, and wires health-check-gated
`depends_on` so Postgres/Redis are ready before the backend starts, and the backend is ready
before the worker and frontend start.
