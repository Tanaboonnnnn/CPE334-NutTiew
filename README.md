# CPE334 NutTiew — Tutoring Appointment System

CPE334 Software Engineering Project (Semester 1/2026)
**Theme 1:** Appointment & Scheduling — One-to-One Tutoring Appointment System.

---

## Sprint 1 Release Status

Sprint 1 delivers a fully functional, peer-reviewed vertical slice spanning **Responsive Web UI → Express 5 REST API Application → Persistent PostgreSQL Database**. All five planned Sprint 1 features (**F-S1-01** through **F-S1-05**) have been formally specified in Part E contracts, peer-reviewed, implemented in Part F, and verified through comprehensive automated test suites (Unit, Real PostgreSQL Concurrency, and Browser E2E).

- **Current Staging / Integration Branch:** `sprint1`
- **Release Target:** `main` (via reviewed integration PR after PR #43 approval)
- **CI / Quality Gate:** [NutTiew CI Workflow](.github/workflows/ci.yml) (Node 24, Typecheck, Build, PostgreSQL Integration, Microsoft Edge E2E)
- **Deliverable 1 Report:** [CPE334 Deliverable 1 Report](docs/deliverables/deliverable-1.md) | [PDF Export](docs/deliverables/CPE334_Deliverable1_NutTiew.pdf)

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
                    │         PostgreSQL Database (16+)            │
                    │   Extension: btree_gist                      │
                    │   Triggers: slot_guard_s1, booking_guard_s1  │
                    │   Constraints: GiST Non-Overlap, 60m Fixed   │
                    │   Row Locks: User & Slot FOR UPDATE          │
                    └──────────────────────────────────────────────┘
```

- **Backend:** Node.js 24 LTS, Express 5.x, TypeScript, `pg` connection pool, Prisma ORM (for schema and migrations), Argon2id password hashing, Zod validation.
- **Frontend:** React 19.x, TypeScript, Vite 7.x, Pure Semantic CSS, WCAG 2.1 AA accessible ARIA tokens.
- **Database:** PostgreSQL 16+ with `btree_gist` extension, transactional triggers (`slot_guard_s1`, `booking_guard_s1`), exclusion constraints (`offered_slot_no_overlap_per_tutor`, `booked_customer_no_overlap`), and least-privilege runtime role separation.
- **Deployment Note:** Production containerization (Docker, GCP Cloud Run) and managed DB (GCP Cloud SQL) are scheduled for **Lab 5** per course syllabus. Sprint 1 is verified locally and on GitHub CI against real PostgreSQL.

---

## Sprint 1 Feature Inventory & GitHub History

Every feature strictly followed the **Part E (Contract/SDS/STS) first $\longrightarrow$ Peer Review $\longrightarrow$ Part F (Code/Tests) $\longrightarrow$ Peer Review** workflow:

| Feature ID | Feature Name | Contract / SDS (Part E) | Part E PR | Implementation & Tests (Part F) | Part F PR | GitHub Issue |
| :--- | :--- | :--- | :---: | :--- | :---: | :---: |
| **F-S1-01** | Authentication, Sessions & Rate Limiting | [F-S1-01 Spec](docs/features/F-S1-01/specification.md) | [#25](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/25) | [Auth Implementation](docs/features/F-S1-01/implementation.md) | [#26](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/26) | [#13](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/13) |
| **F-S1-02** | Tutor Slot Availability & Scheduling | [F-S1-02 Spec](docs/features/F-S1-02/specification.md) | [#27](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/27), [#30](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/30) | [Slot Implementation](docs/features/F-S1-02/implementation.md) | [#28](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/28), [#31](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/31) | [#14](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/14) |
| **Shared** | Booking Data Foundation (Schema & Triggers) | [Data Spec](docs/foundations/booking-data/data-spec.md) | [#34](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/34) | [Foundation Tests](apps/api/test/booking.foundation.db.test.ts) | [#36](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/36), [#40](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/40) | [#33](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/33), [#39](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/39) |
| **F-S1-03** | Customer Availability Browse & Filter | [F-S1-03 Spec](docs/features/F-S1-03/specification.md) | [#32](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/32) | [Availability Web UI](apps/web/src/customer-availability.tsx) | [#37](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/37) | [#15](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/15) |
| **F-S1-04** | Customer Booking & Race Prevention | [F-S1-04 Spec](docs/features/F-S1-04/specification.md) | [#35](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/35) | [Booking API & UI](docs/features/F-S1-04/implementation.md) | [#38](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/38) | [#16](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/16) |
| **F-S1-05** | Booking Retrieval & Schedule View | [F-S1-05 Spec](docs/features/F-S1-05/specification.md) | [#41](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/41) | [Retrieval & Schedule UI](docs/features/F-S1-05/implementation.md) | [#42](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/42) | [#17](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/17) |
| **D1-10** | Sprint 1 Release & Deliverable 1 PDF | [Three-Sprint Plan](docs/sprints/plan.md) | [#24](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/24) | [Deliverable 1 Report](docs/deliverables/deliverable-1.md) | [#43](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/43) | [#18](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/18) |

---

## Local Reproducible Setup

### 1. Prerequisites
- **Node.js:** v24.x LTS (strictly `>=24 <25` per `package.json`).
- **npm:** v10.x+
- **PostgreSQL:** v16.x or v17.x with `btree_gist` extension available.

### 2. Environment Configuration
Copy `.env.example` to `.env` in the repository root:
```bash
cp .env.example .env
```
Generate secure 32-byte (64+ hex characters) secret keys for HMAC signing and rate limiting:
```bash
node -e "console.log('AUTH_CSRF_HMAC_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('AUTH_RATE_KEY=' + require('crypto').randomBytes(32).toString('hex'))"
```
Populate `.env` with the generated keys and your local PostgreSQL connection strings:
```env
# Database Connections
# 1. Owner / Migration Role (DDL, Schema creation, Migrations)
DATABASE_URL="postgresql://nuttiew_owner:owner_password@127.0.0.1:5432/nuttiew?schema=public"

# 2. Non-Owner API Runtime Role (Least Privilege: DML SELECT/INSERT only)
DATABASE_URL_APP="postgresql://nuttiew_runtime:runtime_password@127.0.0.1:5432/nuttiew?schema=public"

# Security & Cryptographic Keys (64+ Hex characters)
AUTH_CSRF_HMAC_KEY=your_generated_64_hex_chars_here
AUTH_RATE_KEY=your_different_generated_64_hex_chars_here
AUTH_CANONICAL_ORIGIN="http://localhost:5173"
AUTH_CSRF_KEY_VERSION="v1"

# Application Settings
NODE_ENV="development"
PORT=3001
TZ="Asia/Bangkok"
```

### 3. Database Roles & Grants Provisioning
In your PostgreSQL instance (e.g. via `psql -U postgres`), execute the least-privilege setup:
```sql
CREATE DATABASE nuttiew;
\c nuttiew;

-- Create owner role for migrations
CREATE ROLE nuttiew_owner WITH LOGIN PASSWORD 'owner_password';
GRANT ALL PRIVILEGES ON DATABASE nuttiew TO nuttiew_owner;
GRANT ALL ON SCHEMA public TO nuttiew_owner;

-- Create restricted runtime role for application API
CREATE ROLE nuttiew_runtime WITH LOGIN PASSWORD 'runtime_password';
GRANT CONNECT ON DATABASE nuttiew TO nuttiew_runtime;
GRANT USAGE ON SCHEMA public TO nuttiew_runtime;
GRANT SELECT, INSERT ON ALL TABLES IN SCHEMA public TO nuttiew_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT ON TABLES TO nuttiew_runtime;
```

### 4. Install Dependencies, Migrate Database & Seed Data
```bash
# Install workspace dependencies
npm install

# Build TypeScript packages
npm run build

# Apply Prisma migrations (using owner role)
npm run db:migrate

# Seed demo Tutors and Customers
npm run db:seed
```

### 5. Start Development Servers
Start both Express backend (port 3001) and Vite React web application (port 5173):
```bash
npm run dev
```
Navigate to `http://localhost:5173` in your browser.

---

## Verification & Automated Test Suites

The repository enforces closed-loop verification across all layers:

### 1. Fast Unit & Contract Tests (29 Tests)
```bash
npm test
```
Tests pure domain logic: Bangkok timezone arithmetic, ISO-8601 validation, IP resolution, and error envelope formatting.

### 2. Static Typecheck & Production Build
```bash
npm run typecheck
npm run build
```
Validates zero TypeScript errors and bundles both `@nuttiew/api` and `@nuttiew/web`.

### 3. Real PostgreSQL Integration & Concurrency Tests (106 Tests)
```bash
npm run test:db -w @nuttiew/api
```
Executes comprehensive integration tests against genuine PostgreSQL:
- **Race A:** Concurrent slot creation by the same tutor (`SLOT-10` / `SQLSTATE 23P01`).
- **Race B:** Concurrent booking on the same offered slot (`BOOK-10` / `SLOT_ALREADY_BOOKED` 409).
- **Race C:** Concurrent overlapping bookings across different tutors (`BOOK-11` / `CUSTOMER_TIME_OVERLAP` 409).
- **Lock Hierarchy:** Pre-index User lock in `booking_guard_s1()` eliminating reverse GiST deadlocks (`BDF-28`).
- **Q05 Cutoff Drift:** Post-lock eligibility evaluation rejecting late submissions (`BOOK-17`).
- **Process Restart Durability:** Verification that committed data survives child process termination and pool reconnection (`SLOT-02/14`, `RET-14`).

### 4. Browser End-to-End Tests (64 Tests)
```bash
npx playwright test
```
Executes all 64 browser tests including the end-to-end domain journey (`e2e/sprint1.journey.spec.ts` [test 39/64]).

$$\text{Total Distinct Automated Tests: } 29 \text{ (Unit)} + 106 \text{ (DB)} + 64 \text{ (E2E)} = \mathbf{199 \text{ Tests (100\% Clean, Zero Failures)}}$$

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
