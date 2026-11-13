# CPE334 NutTiew — Tutoring Appointment System

CPE334 Software Engineering Project (Semester 1/2026)
**Theme 1:** Appointment & Scheduling — One-to-One Tutoring Appointment System.

---

## Sprint 1 Release Status

Sprint 1 delivers a fully functional, peer-reviewed vertical slice spanning **Responsive Web UI → Express 5 REST API Application → Persistent PostgreSQL Database**. All five planned Sprint 1 features (**F-S1-01** through **F-S1-05**) have been formally specified in Part E contracts, peer-reviewed, implemented in Part F, and verified through comprehensive automated test suites (Unit, Real PostgreSQL Concurrency, and Browser E2E).

- **Current Accepted Release Branch (`main`):** `main` @ `4cbfb8c` (merged [PR #55](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/55) from `sprint1@37dfd19`, APPROVED by `@Tanaboonnnnn` ([Review](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/55#pullrequestreview-5879917724)), [CI Run #43279471025](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/43279471025) **3/3 PASS / 209/209 automated tests**; **Git Release Tag:** pending immutable release tag creation on `main`).
- **Integration Branch (`sprint1`):** `sprint1` @ `37dfd19` (includes merged [PR #56](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/56) & [PR #57](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/57); post-release Deliverable 1 PDF appendix sync prepared against accepted `main@4cbfb8c`).
- **CI / Quality Gate:** [NutTiew CI Workflow](.github/workflows/ci.yml) (Node 24, Typecheck, Build, PostgreSQL 18 Integration, Microsoft Edge E2E)
- **Deliverable 1 Report (Final Post-Release Appendix Edition):** [CPE334 Deliverable 1 Report](docs/deliverables/deliverable-1.md) | [PDF Export](docs/deliverables/CPE334_Deliverable1_NutTiew.pdf)

**Source-of-truth for Sprint 1 completion:** the provided *CPE334 Group Work Specification v1* (§§5.3, 8.3, 9) and *Project Deliverable 1 v1* (§§2, 3.6, 4–5) require a working, tested, peer-reviewed release on `main`, a release SHA/tag and honest submission evidence. They do **not** require separate independent formal WCAG/screen-reader or instructor Final Master/Theme 1 sign-offs before merging. Any future instructor update takes precedence. Theme assignment by student-ID last digit still applies; no eligibility proof or independent audit is invented here.

**Post-merge submission note:** the compiled PDF embeds the accepted `main@4cbfb8c` release evidence, [PR #55](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/55) approval, and [PR #57](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/57) handout alignment while preserving all `Not Completed` / `Not Supplied` follow-up disclosures honestly. Creating the immutable Git release tag on `main` and supplying private KMUTT Student IDs via LEB2 remain manual user/team handoff steps.

---

## System Architecture & Tech Stack

```
                    ┌──────────────────────────────────────────────┐
                    │            Browser Client (React 19)         │
                    │   Vite 7 + TypeScript + Accessible ARIA UI   │
                    └──────────────────────┬───────────────────────┘
                                           │ HTTP / HTTPS (REST API)
                                           │ HttpOnly Session Cookie + CSRF
                                           ▼
                    ┌──────────────────────────────────────────────┐
                    │           Backend Server (Express 5)         │
                    │   TypeScript + Zod Schemas + Router Modules  │
                    │   Role-based Auth (Customer / Tutor)         │
                    │   Domain Invariant Guards (Bangkok Timezone) │
                    └──────────────────────┬───────────────────────┘
                                           │ Connection Pool (pg / Prisma)
                                           │ Least-Privilege Database Roles
                                           ▼
                    ┌──────────────────────────────────────────────┐
                    │         PostgreSQL Database (17 / 18)        │
                    │   Extension: btree_gist                      │
                    │   Triggers: slot_guard_s1, booking_guard_s1  │
                    │   Constraints: GiST Non-Overlap, 60m Fixed   │
                    │   Row Locks: User & Slot FOR UPDATE          │
                    └──────────────────────────────────────────────┘
```

- **Backend:** Node.js 24 LTS, Express 5.x, TypeScript, `pg` connection pool, Prisma ORM (for schema and migrations), Argon2id password hashing, Zod validation.
- **Frontend:** React 19.x, TypeScript, Vite 7.x, Pure Semantic CSS, WCAG 2.2 AA design targets & accessible ARIA tokens.
- **Database:** PostgreSQL 17.2 (local) / 18 (CI) with `btree_gist` extension, transactional triggers (`slot_guard_s1`, `booking_guard_s1`), exclusion constraints (`offered_slot_no_overlap_per_tutor`, `booked_customer_no_overlap`), and least-privilege runtime role separation.
- **Deployment Note:** Production containerization (Docker, GCP Cloud Run) and managed DB (GCP Cloud SQL) are scheduled for **Lab 5** per course syllabus. Sprint 1 is verified locally and on GitHub CI against real PostgreSQL.

---

## Sprint 1 Feature Inventory & GitHub History

Every feature strictly followed the **Part E (Contract/SDS/STS) first $\longrightarrow$ Peer Review $\longrightarrow$ Part F (Code/Tests) $\longrightarrow$ Peer Review** workflow:

| Feature ID | Feature Name | Contract / SDS (Part E) | Part E PR | Implementation & Tests (Part F) | Part F PR | GitHub Issue |
| :--- | :--- | :--- | :---: | :--- | :---: | :---: |
| **F-S1-01** | Authentication, Sessions & Rate Limiting | [F-S1-01 Spec](docs/features/F-S1-01/specification.md) | [#25](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/25) | [Auth Implementation](docs/features/F-S1-01/implementation.md) | [#26](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/26), [#51](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/51) | [#13](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/13), [#50](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/50) |
| **F-S1-02** | Tutor Slot Availability & Scheduling | [F-S1-02 Spec](docs/features/F-S1-02/specification.md) | [#27](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/27), [#30](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/30) | [Slot Implementation](docs/features/F-S1-02/implementation.md) | [#28](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/28), [#31](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/31) | [#14](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/14) |
| **Shared** | Booking Data Foundation (Schema & Triggers) | [Data Spec](docs/foundations/booking-data/data-spec.md) | [#34](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/34) | [Foundation Tests](apps/api/test/booking.foundation.db.test.ts) | [#36](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/36), [#40](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/40) | [#33](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/33), [#39](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/39) |
| **F-S1-03** | Customer Availability Browse & Filter | [F-S1-03 Spec](docs/features/F-S1-03/specification.md) | [#32](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/32), [#45](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/45) | [Availability Web UI](apps/web/src/customer-availability.tsx) | [#37](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/37), [#47](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/47), [#54](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/54) | [#15](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/15), [#44](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/44), [#53](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/53) |
| **F-S1-04** | Customer Booking & Race Prevention | [F-S1-04 Spec](docs/features/F-S1-04/specification.md) | [#35](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/35) | [Booking API & UI](docs/features/F-S1-04/implementation.md) | [#38](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/38) | [#16](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/16) |
| **F-S1-05** | Booking Retrieval & Schedule View | [F-S1-05 Spec](docs/features/F-S1-05/specification.md) | [#41](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/41) | [Retrieval & Schedule UI](docs/features/F-S1-05/implementation.md) | [#42](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/42) | [#17](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/17) |
| **D1-10** | Sprint 1 Release & Deliverable 1 PDF | [Three-Sprint Plan](docs/sprints/plan.md) | [#24](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/24) | [Deliverable 1 Report](docs/deliverables/deliverable-1.md) | [#43](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/43), [#49](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/49), [#56](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/56), [#57](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/57), [#55](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/55) (`main@4cbfb8c`) | [#18](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/18), [#48](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/48) |

---

## Local Reproducible Setup

### 1. Prerequisites
- **Node.js:** v24.x LTS (strictly `>=24 <25` per [`package.json`](package.json)).
- **npm:** v10.x+
- **PostgreSQL:** v17.x or v18.x (tested locally on PostgreSQL 17.2 and in CI on PostgreSQL 18) with `pgcrypto` and `btree_gist` extensions available.

### 2. Environment Configuration
Copy [`.env.example`](.env.example) to `.env` in the repository root:
```bash
cp .env.example .env
```
Generate two distinct cryptographically random 32-byte (64-hex-character) secret keys for HMAC CSRF signing and rate-limit hashing:
```bash
node -e "console.log('AUTH_CSRF_HMAC_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('AUTH_RATE_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
```
Populate `.env` using the exact variable names expected by [`apps/api/src/config.ts`](apps/api/src/config.ts):
```env
# 1. Owner / Migration Role (used ONLY by Prisma CLI / migrations; never API runtime)
DATABASE_URL=postgresql://nuttiew_owner:REPLACE_WITH_OWNER_PASSWORD@127.0.0.1:5432/nuttiew?schema=public

# 2. Restricted Non-Owner API Runtime Role (required; API startup and db:seed fail closed if missing or identical to DATABASE_URL)
DATABASE_URL_APP=postgresql://nuttiew_runtime:REPLACE_WITH_RUNTIME_PASSWORD@127.0.0.1:5432/nuttiew?schema=public

# 3. Cryptographic & Origin Settings
AUTH_CSRF_HMAC_KEY=REPLACE_WITH_GENERATED_64_HEX_CHARS
AUTH_RATE_KEY=REPLACE_WITH_DIFFERENT_64_HEX_CHARS
AUTH_CANONICAL_ORIGIN=http://localhost:5173
AUTH_CSRF_KEY_VERSION=v1

# 4. Server Runtime
NODE_ENV=development
PORT=3001
```

### 3. Install Dependencies & Generate Prisma Client
```bash
npm ci
npm run db:generate
```

### 4. Database Roles, Owner-Created Database, Migrations & Least-Privilege Grants
Follow this exact order so tables, indexes, and triggers are created by `nuttiew_owner`, and least-privilege permissions are granted to `nuttiew_runtime` **after** the tables exist:

#### Step A: Create Roles, Owner-Owned Database, and Extensions (as PostgreSQL superuser)
Connect to PostgreSQL as superuser (e.g., `psql -U postgres`):
```sql
CREATE ROLE nuttiew_owner WITH LOGIN PASSWORD 'REPLACE_WITH_OWNER_PASSWORD'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
CREATE ROLE nuttiew_runtime WITH LOGIN PASSWORD 'REPLACE_WITH_RUNTIME_PASSWORD'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;

CREATE DATABASE nuttiew OWNER nuttiew_owner;
\c nuttiew;
ALTER SCHEMA public OWNER TO nuttiew_owner;

-- Superuser pre-installs extensions once so non-owner migrations pass idempotently
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;
```

#### Step B: Apply Schema & Security Triggers (as `nuttiew_owner`)
Ensure `.env` has `DATABASE_URL` set to `nuttiew_owner`, then run:
```bash
npm run db:migrate
```
This applies all forward-only Prisma/SQL migrations under [`apps/api/prisma/migrations/`](apps/api/prisma/migrations/) as `nuttiew_owner`, installing `User`, `Session`, `AuthAttemptBucket`, `AuthAttemptReservation`, `Slot`, `Booking`, `btree_gist` exclusion constraints, and `SECURITY DEFINER` triggers (`slot_guard_s1`, `booking_guard_s1`).

#### Step C: Grant Least-Privilege Runtime Permissions (after migrations)
Connect to the `nuttiew` database as `nuttiew_owner` (e.g., `psql -U nuttiew_owner -d nuttiew`) or as superuser `postgres` while connected to `nuttiew`:
```sql

GRANT CONNECT ON DATABASE nuttiew TO nuttiew_runtime;
GRANT USAGE ON SCHEMA public TO nuttiew_runtime;

-- Auth, session, and rate-limiting tables require SELECT/INSERT/UPDATE/DELETE
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "User", "Session", "AuthAttemptBucket", "AuthAttemptReservation"
  TO nuttiew_runtime;

-- Append-only domain tables in Sprint 1: never grant broad UPDATE or DELETE on Slot or Booking
GRANT SELECT, INSERT ON "Slot", "Booking" TO nuttiew_runtime;

-- PostgreSQL requires UPDATE privilege on at least one column of Slot for SELECT ... FOR UPDATE row locks;
-- trigger slot_guard_s1() rejects Slot mutations, and runtime holds no table-wide UPDATE/DELETE on Slot/Booking.
GRANT UPDATE ("id") ON "Slot" TO nuttiew_runtime;

-- Scope future default read-only SELECT access explicitly to tables created by nuttiew_owner
ALTER DEFAULT PRIVILEGES FOR ROLE nuttiew_owner IN SCHEMA public
  GRANT SELECT ON TABLES TO nuttiew_runtime;
```

*(Optional — test database only, never in production)* To run the full `npm run test:db` suite including `BDF-20..25` direct-SQL trigger-probe checks, provision a separate disposable test database (e.g., `nuttiew_test`) plus an isolated `nuttiew_booking_probe` role matching [`.github/scripts/prepare-test-db.sh`](.github/scripts/prepare-test-db.sh) (`GRANT SELECT ON "Slot"` and `GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON "Booking" TO nuttiew_booking_probe`) and set `DATABASE_URL_BOOKING_PROBE` in `.env`.

### 5. Seed Initial Demo Users
[`apps/api/prisma/seed.ts`](apps/api/prisma/seed.ts) connects through `DATABASE_URL_APP` (`nuttiew_runtime`) and requires `SEED_EMAIL`, `SEED_PASSWORD` (minimum 12 UTF-8 bytes), and `SEED_ROLE` (`Customer` or `Tutor`) in the environment:

**Bash / macOS / Linux / Git Bash:**
```bash
SEED_EMAIL="tutor.demo@example.test" SEED_PASSWORD="REPLACE_WITH_12_PLUS_CHAR_PASSWORD" SEED_ROLE="Tutor" npm run db:seed
SEED_EMAIL="customer.demo@example.test" SEED_PASSWORD="REPLACE_WITH_12_PLUS_CHAR_PASSWORD" SEED_ROLE="Customer" npm run db:seed
```

**Windows PowerShell:**
```powershell
$env:SEED_EMAIL="tutor.demo@example.test"; $env:SEED_PASSWORD="REPLACE_WITH_12_PLUS_CHAR_PASSWORD"; $env:SEED_ROLE="Tutor"; npm run db:seed
$env:SEED_EMAIL="customer.demo@example.test"; $env:SEED_PASSWORD="REPLACE_WITH_12_PLUS_CHAR_PASSWORD"; $env:SEED_ROLE="Customer"; npm run db:seed
Remove-Item Env:SEED_EMAIL, Env:SEED_PASSWORD, Env:SEED_ROLE
```

### 6. Build & Start Development Servers
```bash
# Verify types and build both workspaces
npm run typecheck
npm run build

# Start Express API (http://localhost:3001) and Vite Web (http://localhost:5173)
npm run dev
```
*(Windows PowerShell note: run `npm run dev -w @nuttiew/api` and `npm run dev -w @nuttiew/web` in two terminals.)*
Navigate to `http://localhost:5173` in your browser.

### 7. Cloud Readiness (GH-01 — pre-Docker prep)

Run the same Sprint 1 app in a disposable/cloud-style runtime without changing domain behavior:

- **Host / port:** the API binds `0.0.0.0` so a container/load balancer can reach it, reading `PORT` from the environment (defaults to `3001`). Local development is unchanged. Sessions remain PostgreSQL-backed (the `Session` table), not in-memory.
- **Readiness:** `GET /api/ready` is unauthenticated and probes the restricted runtime pool with `SELECT 1`. Response is `200 {"status":"ready"}` when the database is reachable and `503` (standard error envelope, `SERVICE_UNAVAILABLE`) when it is not. No DB URL, password, SQL error or stack trace is ever returned.
- **Environment:** required — `DATABASE_URL` (migration/admin only), `DATABASE_URL_APP` (restricted API runtime; startup fails closed without it), `AUTH_CSRF_HMAC_KEY`, `AUTH_RATE_KEY`, `AUTH_CANONICAL_ORIGIN`, `NODE_ENV`, `PORT`. Optional — `AUTH_CSRF_KEY_VERSION` / `AUTH_CSRF_PREVIOUS_*` (rotation), `AUTH_TRUSTED_PROXIES` (reverse-proxy IPs), `SEED_EMAIL` / `SEED_PASSWORD` / `SEED_ROLE` (idempotent seed), `DATABASE_URL_BOOKING_PROBE` (test-only). See [`.env.example`](.env.example).
- **Same-origin & HTTPS:** the API rejects cross-site `Origin`/CSRF. In a cloud runtime the UI and API must be served from the **same origin** over **HTTPS**, and `AUTH_CANONICAL_ORIGIN` must be that public HTTPS origin; production cookies are `Secure` (`SameSite=Lax`), so a plain HTTP origin in production breaks session/CSRF.
- **Verification status (GH-01):**
  - *Verified locally:* API host binding on `0.0.0.0`, runtime `PORT` support (code inspection and pre-PR smoke evidence), readiness handler behavior, `npm ci`, `npm run db:generate`, `npm test` (34/34), `npm run typecheck`, `npm run build`, and `git diff --check`.
  - *Verified with injected Pool test doubles:* `GET /api/ready` fails closed with `503` and does not leak connection/SQL details when `query()` rejects (READY-03/04).
  - *Verified in isolated GitHub Actions CI:* [run 43403576375](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/43403576375) passed all 3 jobs. PostgreSQL 18 `test:db` passed **111/111**, including real-DB readiness READY-01/02 and all four readiness tests (READY-01..04 **4/4**); Microsoft Edge E2E passed. CI E2E starts `server.ts` at its default `PORT=3001`; it is not evidence of a non-default `PORT` override.
  - *NOT RUN locally:* real-PostgreSQL readiness success, full database integration, and browser E2E because an isolated local test database and credentials were unavailable; these checks **were run in CI** as described above.
  - *Pending in later issues (not part of GH-01):* Docker image (GH-02, #61) and GCP/Cloud SQL integration (later phase).

---

## Verification & Automated Test Suites

The repository enforces closed-loop verification across all layers:

### 1. Fast Unit & Contract Tests (34 Tests)
```bash
npm test
```
Tests pure domain and frontend helper logic (`29` API unit tests + `5` Web Option A calendar utility tests): Bangkok timezone arithmetic, ISO-8601 validation, IP resolution, runtime credential config boundaries, and calendar cell grouping.

### 2. Static Typecheck & Production Build
```bash
npm run typecheck
npm run build
```
Validates zero TypeScript errors across workspaces and bundles both `@nuttiew/api` and `@nuttiew/web`.

### 3. Real PostgreSQL Integration & Concurrency Tests (107 Tests)
```bash
# Hosted CI (PostgreSQL 18) default parallel run:
npm run test:db -w @nuttiew/api

# Local Windows PostgreSQL 17.2 sequential recommendation (avoids multi-file connection/Argon2id pool saturation):
npx --workspace=@nuttiew/api vitest run --fileParallelism=false \
  test/auth.db.test.ts test/auth.extended.db.test.ts test/guards.db.test.ts \
  test/auth.boundary.db.test.ts test/auth.barrier.db.test.ts test/auth.crash.db.test.ts \
  test/auth.http-clock.db.test.ts test/slots.db.test.ts test/slots.race.db.test.ts \
  test/slots.restart.db.test.ts test/booking.foundation.db.test.ts \
  test/availability.db.test.ts test/bookings.db.test.ts test/retrieval.db.test.ts
```
Executes all 14 integration test files (`107` tests) against genuine PostgreSQL (`nuttiew_test` / `nuttiew`):
- **Race A:** Concurrent slot creation by the same tutor (`SLOT-10/11` / `SQLSTATE 23P01`).
- **Race B:** Concurrent booking on the same offered slot (`BOOK-10` / `SLOT_UNAVAILABLE` 409).
- **Race C:** Concurrent overlapping bookings across different tutors (`BOOK-11` / `CUSTOMER_OVERLAP` 409).
- **Lock Hierarchy:** Pre-index User lock in `booking_guard_s1()` eliminating reverse GiST deadlocks (`BDF-28`).
- **Q05 Cutoff Drift:** Post-lock eligibility evaluation rejecting late submissions (`BOOK-17`).
- **Process Restart Durability:** Verification that committed data survives child process termination and pool reconnection (`SLOT-02/14`, `RET-14`).

### 4. Browser End-to-End Tests (68 Tests)
```bash
npx playwright test
```
Executes all 68 Microsoft Edge tests (11/12 active spec files against real API + PostgreSQL), including the Sprint 1 vertical journey (`e2e/sprint1.journey.spec.ts`), Option A Monthly Calendar verification (`e2e/availability.calendar.spec.ts`, `4` tests), and Login/Auth theme & computed WCAG token checks (`e2e/auth.a11y.spec.ts`, `2` tests).

$$\text{Total Distinct Automated Tests: } 34 \text{ (Unit)} + 107 \text{ (DB)} + 68 \text{ (E2E)} = \mathbf{209 \text{ Distinct Tests}}$$

*Notes:*
- *Verify CI against the accepted release baseline: `sprint1@37dfd19` (merged into `main@4cbfb8c`) passed [PR #55 Run #43279471025](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/43279471025) and [Push Run #43279457068](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/43279457068), including Unit/types/build, PostgreSQL 18 and Microsoft Edge E2E (3/3 jobs).*
- *Accessibility evidence: automated Playwright focus/contrast/reflow checks (`e2e/auth.a11y.spec.ts`, `UX-CAL-08..09`) **PASS**; informal author walkthrough (2026-11-11) **PASS (author-only)**; independent formal WCAG 2.2 AA / screen-reader audit **NOT COMPLETED**. An additional instructor-issued Final Master/Theme 1 confirmation was **not supplied**. Neither is an extra D1 merge blocker in the provided course handouts; track any future work without misreporting PASS or formal approval. Required Sprint 1 tests, reviewed release into `main`, immutable tag/commit, and truthful D1 submission evidence remain mandatory.*

---

## Course Deliverable 1 Documentation

Complete project documentation is organized in `docs/`:
- **Part A:** [Whole-Product Software Requirements Specification (SRS)](docs/srs.md)
- **Part B:** [Feature Inventory](docs/features.md) & [Traceability Matrix](docs/traceability.md)
- **Part C:** [Whole-Product System Software Design Specification (SDS)](docs/system-sds.md)
- **Part D:** [Feasible Three-Sprint Delivery Plan](docs/sprints/plan.md)
- **Part E:** Feature Specifications & STSs ([F-S1-01](docs/features/F-S1-01/), [F-S1-02](docs/features/F-S1-02/), [Shared](docs/foundations/booking-data/), [F-S1-03](docs/features/F-S1-03/), [F-S1-04](docs/features/F-S1-04/), [F-S1-05](docs/features/F-S1-05/))
- **Part F:** [Sprint 1 Integration & Deliverable 1 Report](docs/deliverables/deliverable-1.md) | [PDF Export](docs/deliverables/CPE334_Deliverable1_NutTiew.pdf)

---

## Team & Contribution Matrix

| Team Member | GitHub Username | Quantitative Contribution | Primary Responsibilities (Sprint 1) |
| :--- | :--- | :---: | :--- |
| **Tanboon Teawsawat** | [@Tanaboonnnnn](https://github.com/Tanaboonnnnn) | **50%** | Requirements discovery (Q01–Q32), Whole-product SRS & System SDS architecture, Three-Sprint planning, Project #6 Kanban management, Substantive peer reviews on PRs |
| **Chxtamos** | [@Chxtamos](https://github.com/Chxtamos) | **50%** | Express 5 API implementation, PostgreSQL schema & GiST exclusion triggers, Concurrency lock ordering, React 19 UI, End-to-End Playwright journey tests, Deliverable 1 report & PDF |

---

## License

Academic project developed for CPE334 Software Engineering, Department of Computer Engineering, KMUTT.
