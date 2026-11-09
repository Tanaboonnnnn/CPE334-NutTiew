# CPE334 NutTiew — Tutoring Appointment System

CPE334 Software Engineering Project (Semester 1/2026)
**Theme 1:** Appointment & Scheduling — One-to-One Tutoring Appointment System.

---

## Sprint 1 Release Status

Sprint 1 delivers a fully functional, peer-reviewed vertical slice spanning **UI → API / Application Layer → Persistent PostgreSQL Database**. All five planned Sprint 1 features (F-S1-01 through F-S1-05) have been designed (Part E), peer-reviewed, implemented (Part F), and verified with comprehensive automated suites (Unit, Database Concurrency, and Browser E2E).

- **Current Staging / Integration Branch:** `sprint1`
- **Release Target:** `main` (via reviewed integration PR)
- **CI / Quality Gate:** [NutTiew CI Workflow](.github/workflows/ci.yml) (Node 24, Typecheck, Build, PostgreSQL Integration, Browser E2E)
- **Deliverable 1 Report:** [CPE334 Deliverable 1 Report](docs/deliverables/deliverable-1.md) | [PDF Export](docs/deliverables/CPE334_Deliverable1_NutTiew.pdf)

---

## System Architecture

```
                    ┌──────────────────────────────────────────────┐
                    │            Browser Client (React 18)         │
                    │   Vite + TypeScript + Accessible ARIA UI    │
                    └──────────────────────┬───────────────────────┘
                                           │ HTTP / HTTPS (REST API)
                                           │ Session Cookie + CSRF
                                           ▼
                    ┌──────────────────────────────────────────────┐
                    │           Backend Server (Fastify)           │
                    │   TypeScript + Schema Validation + Plugins   │
                    │   Role-based Auth (Customer / Tutor)         │
                    │   Domain Invariant Guards (Bangkok Timezone) │
                    └──────────────────────┬───────────────────────┘
                                           │ Connection Pool (pg / Prisma)
                                           ▼
                    ┌──────────────────────────────────────────────┐
                    │         PostgreSQL Database (16+)            │
                    │   Atomic SERIALIZABLE Transactions           │
                    │   Triggers: Exclusive Slot Locking           │
                    │   Constraints: Non-overlapping, No-past-time │
                    └──────────────────────────────────────────────┘
```

> **Deployment Note:** Cloud deployment (GCP Cloud Run + Cloud SQL + Docker) is scheduled for **Lab 5** per course syllabus. Sprint 1 deliverable is verified locally and on GitHub CI against real PostgreSQL.

---

## Sprint 1 Feature Inventory

| Feature ID | Feature Name | Contract / SDS | Verification Ledger | GitHub Issue | Pull Request |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **F-S1-01** | Authentication & Session Management | [F-S1-01 Spec](docs/features/F-S1-01/specification.md) | [F-S1-01 Ledger](docs/features/F-S1-01/verification-ledger.md) | [#13](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/13) | [#32](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/32) |
| **F-S1-02** | Tutor Slot Availability & Scheduling | [F-S1-02 Spec](docs/features/F-S1-02/specification.md) | [F-S1-02 Ledger](docs/features/F-S1-02/verification-ledger.md) | [#14](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/14) | [#34](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/34) |
| **F-S1-03** | Customer Availability Browse & Filter | [F-S1-03 Spec](docs/features/F-S1-03/specification.md) | [F-S1-03 Ledger](docs/features/F-S1-03/verification-ledger.md) | [#15](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/15) | [#36](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/36) |
| **F-S1-04** | Customer Booking & Race Prevention | [F-S1-04 Spec](docs/features/F-S1-04/specification.md) | [F-S1-04 Ledger](docs/features/F-S1-04/verification-ledger.md) | [#16](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/16) | [#38](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/38) |
| **F-S1-05** | Booking Retrieval & Schedule View | [F-S1-05 Spec](docs/features/F-S1-05/specification.md) | [F-S1-05 Ledger](docs/features/F-S1-05/verification-ledger.md) | [#17](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/17) | [#41](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/41), [#42](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/42) |
| **D1-10** | Sprint 1 Release & Deliverable 1 PDF | [Plan](docs/sprints/plan.md) | [Deliverable 1 Report](docs/deliverables/deliverable-1.md) | [#18](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/18) | [PR](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pulls) |

---

## Local Reproducible Setup

### 1. Prerequisites
- **Node.js:** v24.x LTS (or v22.x LTS)
- **npm:** v10.x+
- **PostgreSQL:** v16.x or v17.x (local instance or Docker Compose)

### 2. Environment Configuration
Create a `.env` file in the repository root by copying the template:
```bash
cp .env.example .env
```
Ensure database connection parameters point to your local PostgreSQL instance:
```env
# Database Connections (Migration/Owner & Application Role)
DATABASE_URL="postgresql://nuttiew_owner:nuttiew_owner_pass@localhost:5432/nuttiew_dev?schema=public"
DATABASE_URL_APP="postgresql://nuttiew_app:nuttiew_app_pass@localhost:5432/nuttiew_dev?schema=public"

# Application Server
PORT=3001
CORS_ORIGIN="http://localhost:5173"
SESSION_SECRET="nuttiew-development-session-secret-min-32-chars-long"

# System Timezone
TZ="Asia/Bangkok"
```

### 3. Install Dependencies & Build Packages
```bash
npm install
npm run build
```

### 4. Database Migration & Seeding
Run Prisma migrations to establish database schema, triggers, and constraints:
```bash
# Apply migrations
npm run db:migrate

# Seed initial test data (Tutors, Customers, Slots)
npm run db:seed
```

### 5. Start Development Servers
Start both Fastify backend (port 3001) and Vite web frontend (port 5173):
```bash
npm run dev
```
Open your browser at `http://localhost:5173`.

---

## Verification & Automated Test Suites

The repository enforces strict closed-loop quality verification across all layers:

### 1. Fast Unit & Contract Tests
```bash
npm test
```
Executes pure domain unit tests (Bangkok timezone arithmetic, ISO-8601 validation, argon2 hashing, error envelope compliance).

### 2. TypeScript Static Typecheck & Project Build
```bash
npm run typecheck
npm run build
```
Validates zero TypeScript errors and produces production bundles for both `@nuttiew/api` and `@nuttiew/web`.

### 3. Real PostgreSQL Database & Concurrency Tests
```bash
npm run test:db -w @nuttiew/api
```
Executes comprehensive integration tests against real PostgreSQL:
- **Race A:** Concurrent bookings on the same offered slot (Strict mutual exclusion).
- **Race B:** Concurrent booking creation vs. slot cancellation/modification.
- **Race C:** Overlapping customer booking attempts across distinct tutors.
- Atomic rollback on transaction failures and trigger invariants.

### 4. Browser End-to-End Tests (Playwright)
```bash
npx playwright test
```
Runs the full suite of 64+ browser tests including:
- F-S1-01: Authentication, session invalidation, CSRF protection, rate limiting.
- F-S1-02: Tutor slot creation, recurring slots, 60-min enforcement, calendar UI.
- F-S1-03: Customer availability browsing, date filtering, bookable exclusions.
- F-S1-04: Booking confirmation flow, double-click prevention, 409 conflict banners.
- F-S1-05: Private customer booking list, modal detail view, tutor schedule view with pseudonymous `customerRef`.
- Sprint 1 Vertical Domain Journey (`e2e/sprint1.journey.spec.ts`).

---

## Continuous Integration (CI)

Every Pull Request against `sprint1` and `main` is validated automatically via GitHub Actions:
- **Build & Unit Test:** Verifies compile, bundle, and unit test pass.
- **Database Integration:** Runs real PostgreSQL service container tests.
- **Browser E2E:** Launches headless browser and verifies user journeys.

---

## Course Deliverable 1 Documentation

Complete project documentation is organized in `docs/`:
- **Part A:** [Whole-Product Software Requirements Specification (SRS)](docs/srs.md)
- **Part B:** [Feature Inventory](docs/features.md) & [Traceability Matrix](docs/traceability.md)
- **Part C:** [Whole-Product System Software Design Specification (SDS)](docs/system-sds.md)
- **Part D:** [Feasible Three-Sprint Plan](docs/sprints/plan.md)
- **Part E:** Feature Specifications & STSs ([F-S1-01](docs/features/F-S1-01/), [F-S1-02](docs/features/F-S1-02/), [F-S1-03](docs/features/F-S1-03/), [F-S1-04](docs/features/F-S1-04/), [F-S1-05](docs/features/F-S1-05/))
- **Part F:** [Sprint 1 Integration & Deliverable 1 Report](docs/deliverables/deliverable-1.md)

---

## Team & Contribution Matrix

| Team Member | GitHub Username | Primary Responsibilities (Sprint 1) |
| :--- | :--- | :--- |
| **Tanboon Teawsawat** | [@Tanaboonnnnn](https://github.com/Tanaboonnnnn) | Requirements discovery, SRS & System SDS architecture, Sprint planning, Peer review & verification |
| **Chxtamos** | [@Chxtamos](https://github.com/Chxtamos) | Backend API & DB implementation, Frontend React UI, Concurrency triggers, E2E journey tests & PDF compilation |

---

## License

Academic project developed for CPE334 Software Engineering, Department of Computer Engineering, KMUTT.
