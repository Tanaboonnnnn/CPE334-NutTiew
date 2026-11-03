# NutTiew — Whole-product System Design Specification (SDS)

## 0. Document control and design authority

| Field | Value |
|---|---|
| Deliverable | CPE334 Deliverable 1, Part C; GitHub Issue [#11](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/11) |
| Artifact | docs/system-sds.md, design draft v0.1.0, 3 November 2026 |
| Product | One-to-one Tutoring Appointment System (Theme 1: Appointment & Scheduling) |
| Coverage | Whole-product architecture for Sprints 1–3; detailed implementation contracts remain feature-scoped |
| Author / required peer reviewer | @Tanaboonnnnn / @Chxtamos |
| Status | **PROPOSED ENGINEERING DESIGN — pending substantive peer review; NOT instructor-approved or implemented** |
| Intended integration | Issue branch -> reviewed PR into sprint1 -> later separately reviewed sprint1 -> main |
| Repo state inspected | Remote sprint1 at ba577db79ccee6c0f0861b761fb361bbb252b027 (3 Nov 2026); tracked files are AGENTS.md, README.md and docs/*.md; no application scaffold, package manifest, Prisma schema or CI was present |
| Source gates | Final instructor Master and official team Theme 1 allocation remain unverified (SRS OD-011/OD-012); do not infer formal sign-off |

**Order of authority.** An instructor-issued *final* Master/change notice outranks the available draft handout. Until verified, use the reviewed stakeholder decisions Q01–Q32, [whole-product SRS](srs.md), [Sprint 1 requirements](requirements.md), [feature inventory](features.md), [traceability](traceability.md), Issue #11 and root [AGENTS.md](../AGENTS.md). The documents describe different levels: business rules are normative outcomes; technology choices in this SDS are **engineering proposals awaiting peer approval**, not new stakeholder rules. Preserve all existing IDs and report conflicts before modifying them.

**Boundary.** This file selects a feasible architecture and explains verifiable invariants. It does **not** add app code, create a working API, run database tests, deploy to GCP, or finalize individual endpoint/field validation contracts. Part E Feature SDS/STS must be versioned and peer-reviewed **before** each corresponding feature's code. Sprint 2/3 placement remains proposed until Issue #12 is accepted.

## 1. Design objectives and decisions

The Sprint 1 minimum is a working **browser UI -> authenticated API/service -> durable relational database** slice: login/logout/current user, Tutor publishing individual 60-minute offered Slots, Customer availability discovery and exclusive Booking, authorized Customer/Tutor reads, and the three concurrency invariants. Records survive refresh and restart. Sprint 2 adds cancellation, one-time cross-Tutor rescheduling, withdrawn Slot history and durable private notices; Sprint 3 adds a Tutor-only summary. Payments, attendance confirmation, recurring/bulk Slots, automatic SLA or notifications by email/SMS are **not authorized** by the product baseline.

### 1.1 Engineering decision register

| Decision | Selected design / reason | Trade-off and current approval |
|---|---|---|
| **SD-01** | A TypeScript modular monolith, not microservices: a single Express API exposes bounded identity, scheduling, Booking and future notice/report modules. | Smaller operational and review burden for two students; **proposed for peer approval**. |
| **SD-02** | React 19 + Vite 8, client-side navigation, accessible shared form/list/status components. | No SSR complexity for the accepted workflows; **proposed**. |
| **SD-03** | Node.js 24 LTS + npm 11 workspaces with one root lockfile; Express 5, TypeScript 5.9. | Matches the inspected development runtime and supports reproducible builds; **proposed**. |
| **SD-04** | PostgreSQL 18, Prisma 7 with PostgreSQL adapter, versioned SQL migrations; native PostgreSQL range/exclusion constraints supplement ORM checks. | Relational integrity is essential for races A/B/C; raw SQL constraints require review and DB-specific tests; **proposed**. |
| **SD-05** | Keep one immutable 60-minute time interval per Slot. Derive Tutor schedule from owned Slots and Bookings, not a separate writable schedule table. | Avoids drift and unnecessary entity state; a Tutor schedule is a **logical read projection**. |
| **SD-06** | Derive occupancy from an active Booking; do not independently toggle a fragile Slot.isBooked flag. Maintain Slot lifecycle Offered/Withdrawn for later history. | Simplifies atomic cancellation/reschedule and protects historical records; **proposed**. |
| **SD-07** | PostgreSQL unique/exclusion constraints + SERIALIZABLE transactions + deterministic row locks + bounded retries for genuine transaction aborts. | More careful migrations and error handling; selected to prove all three real-DB races. |
| **SD-08** | Use DB clock_timestamp() *after lock contention* at the final guarded eligibility decision, and UTC instants in storage/transport with Asia/Bangkok presentation. | Prevents the Q05 request-arrival-time bug; clock/rounding tests are mandatory. |
| **SD-09** | Local Argon2id password hashes and opaque, server-revocable, cookie-based sessions; roles and record ownership checked by API/service. | Simpler reliable logout than stateless unrevocable tokens; cookie and CSRF safeguards are mandatory. |
| **SD-10** | A single-origin production web/API deployment (API can serve built web assets), durable managed PostgreSQL and managed secrets on GCP later. | Avoids cross-origin cookie/CORS complexity; **planning only** for Lab 5. |
| **SD-11** | Structured JSON errors and response allowlists; generated request IDs, no secrets, stack traces or third-party record details. | Feature SDS specifies exact endpoints/DTOs, not this whole-system overview. |
| **SD-12** | No invented Tutor work hours, look-ahead maximum, start-minute grid, private data visibility or retry-key retention policy. | Unresolved stakeholder choices remain gates OD-001..015, not implicit defaults. |

All SD-01..12 require review in Issue #11's PR. These selections are *decisions proposed for approval*, not evidence of running packages, applied SQL or instructor authorization.

### 1.2 Technology baseline (design pins, not installed app dependencies)

| Layer / tool | Version target | Basis / implementation note |
|---|---|---|
| Node.js / npm | Node 24.x LTS; npm 11.x | Actual inspected machine: v24.14.0 / 11.18.0; choose Node 24 rather than introducing new Node 26 to this project. |
| Frontend | React 19.3.1, Vite 8.3.5, React Router 7.x | Candidate current registry versions checked 3 Nov; Router exact patch determined when installed. |
| API and validation | Express 5.3.0, TypeScript 5.9.3, Zod 4.6.7 | End-to-end TypeScript, validated boundaries; deliberately choose mature TS 5.9 rather than a new major. |
| DB/ORM | PostgreSQL 18.x; prisma, @prisma/client and @prisma/adapter-pg **7.10.1** plus pg | Prisma 7 requires its supported driver-adapter/config path; maintain SQL migrations for exclusions/partial indexes. |
| Credential/session | argon2 0.45.2; Node crypto secure random and SHA-256 for session-token digests | Password hashes use Argon2id with distinct salts; token digests are **not** password hashes. |
| Tests | Vitest 5.1.0, Supertest 7.3.1, Playwright 1.64.1; real PostgreSQL | Versions were read from npm registry; no project test suite currently exists. |
| Local tooling | Git, Docker, PostgreSQL service/container, optional psql | Docker CLI detected (29.9.2); psql CLI was **not found on PATH**. No DB container or running DB was verified. |

**Version discipline:** Record these as *proposed baseline pins*. During the scoped Part E implementation, check real peer-dependency compatibility, resolve patches using npm install, commit package-lock.json, use npm ci thereafter, and update this table only through an explained reviewed change. Do not claim that a package is installed merely because npm registry reports it. The PostgreSQL 18 target must also be checked against the GCP managed offering and required extensions before Lab 5.

## 2. System architecture and component boundaries

~~~mermaid
flowchart LR
  B["Browser (Customer / Tutor)"] --> W["React + Vite UI"]
  W -->|same-origin HTTPS / JSON| A["Express 5 API"]
  A --> I["Identity + sessions"]
  A --> S["Tutor scheduling service"]
  A --> K["Booking and transaction service"]
  A --> N["Future notification / summary services"]
  I --> D[("PostgreSQL (durable)")]
  S --> D
  K --> D
  N --> D
~~~

- **UI:** renders navigation and the permitted controls, converts UTC instants for display in Asia/Bangkok, preserves form state on errors. UI checks are usability feedback **not authorization**.
- **Transport/API boundary:** authenticates the session, validates and normalizes input, imposes request/body limits, assigns a correlation ID, calls one application use case, and serializes an explicit data allowlist.
- **Domain/services:** keep time and Booking rules, role/record ownership, mutation transaction boundaries and feature-specific outcomes in one place. A controller must not implement a second inconsistent cutoff check.
- **Persistence:** Prisma Client manages typed access, migration provenance and transactions; reviewed parameterized SQL handles PostgreSQL row locking, constraints and DB-time sampling where required. No in-memory array acts as the source of truth.
- **Future capabilities:** Customer cancellation/reschedule and Tutor withdrawal/notice reuse the Booking service and Slot/Booking constraints. Tutor summary derives count and list from the same authorized query predicates; no independent source of state.

**Boundaries:** anonymous browser -> session-checked API is the primary trust boundary; API -> database uses a least-privileged account. A client-provided customerId, tutorId, user role, Booking owner, current status or cutoff timestamp is **never trusted**. Public Customer availability is a deliberately narrow projection, not the Tutor's restricted full schedule. API and web may be separately built in development but share one origin through the Vite proxy; production can serve prebuilt web assets through the API image.

**Suggested future repository layout** (none of these folders are created by Issue #11):

~~~text
package.json                 # private npm workspaces, pinned Node/npm; scripts
package-lock.json            # committed after first install
apps/web/                    # React/Vite, routes, page components, API client
apps/api/src/                # Express controllers, auth, services, DB adapter
apps/api/prisma/             # Prisma schema, versioned migrations, seed
apps/api/prisma.config.ts    # Prisma 7 connection/migration/seed configuration
apps/api/test/               # API, DB-integrity and concurrency tests
docs/                       # product SRS, traceability, System SDS, Feature SDS/STS
~~~

No separate payment, background-queue, cache, notification-provider or microservice infrastructure is required by Sprint 1.

## 3. Relational domain, ownership and evolution

### 3.1 Entity relationship view

~~~mermaid
erDiagram
  USER ||--o{ SESSION : authenticates
  USER ||--o{ SLOT : "tutor owns"
  USER ||--o{ BOOKING : "customer owns"
  SLOT ||--o{ BOOKING : "used by over history"
  BOOKING ||--o| RESCHEDULE_HISTORY : "one successful change max"
  BOOKING ||--o| NOTIFICATION : "optional tutor-cancel notice"
  USER ||--o{ NOTIFICATION : "customer recipient"
~~~

A **Tutor Schedule** is the filtered projection of one Tutor's Slots and the currently assigned Bookings. It is **not** a second mutable appointment record. This keeps Q02 ownership, Q06 overlap and Q31 counts attached to authoritative relations.

### 3.2 Proposed entities and keys

| Entity (stage) | Essential columns / relationships | Validation and persistence invariant |
|---|---|---|
| **User (S1)** | id UUID PK; email with normalized unique index; passwordHash; role Customer/Tutor; isActive; timestamps | Exactly one effective role per account; active account for authentication; role/ownership verified server-side, never from a client body. No self-registration is in scope. |
| **Session (S1)** | id UUID PK; userId FK -> User; unique tokenDigest; createdAt; expiresAt; revokedAt (nullable) | Store digest, not raw cookie token; every protected request requires a live session and active current User. |
| **Slot (S1 fields, S2 lifecycle)** | id UUID PK; tutorId FK -> User; startsAt and endsAt TIMESTAMPTZ; lifecycle Offered or Withdrawn; createdAt; withdrawnAt nullable | Interval exactly 60 minutes; immutable Tutor/time/ID; offered Slots of one Tutor never overlap; withdrawn Slot never reactivated under the same ID. |
| **Booking (S1 fields, S2 extension)** | id UUID PK; customerId FK -> User; currentSlotId FK -> Slot; startsAt/endsAt current interval snapshot; status Booked or Cancelled; cancellationActor and tutorCancellationReason nullable (S2); timestamps | One active Booking per Slot; one Customer's active windows never overlap; interval copied from locked Slot, never accepted from a client; current Tutor derives from Slot.tutorId. |
| **RescheduleHistory (S2 only)** | id UUID PK; bookingId FK -> Booking **UNIQUE**; old/new Slot IDs and Tutor IDs; old/new intervals; changedAt | Successful change appends exactly one immutable record while retaining Booking ID. Rejected change appends none and uses no quota. |
| **Notification (S2 only)** | id UUID PK; recipientCustomerId FK -> User; bookingId FK -> Booking; kind TutorCancelled; createdAt; readAt nullable | One relevant private notice per successful Tutor cancellation, persisted in the same transaction; readAt never deletes the notice. Reason may be safely projected from owning Booking rather than duplicated. |

- Slot -> Booking is **one-to-many historically**, but **zero-or-one active**. Cancelled Bookings keep their Slot history and no longer occupy it. Slot Offered means **published**, not necessarily free: occupancy is calculated from Booking status Booked.
- Past is a derived display classification for Booked appointments whose **end** is earlier than the evaluation instant; it is **not** a Booking status, and the application must never invent Completed or attendance.
- A Customer cancellation sets Booking Cancelled and leaves its original Slot Offered; another new Booking must still pass Q05 independently. A Tutor cancellation sets Booking Cancelled and original Slot Withdrawn **in one transaction**. Direct withdrawal while an active Booking exists is forbidden.
- On reschedule (S2), retain Booking.id, move currentSlotId and current interval, write history atomically, free the original offered Slot and claim the destination. Rescheduling to a different Tutor is valid when all rules pass. Prior-Tutor historical visibility is **not** assumed (OD-015).
- Optional reporting fields, Tutor profile, teaching subject, room, payment, price or attendance are **not** mandatory and must not be added on invented stakeholder authority.
- FKs ensure stable ownership references; User role cannot be inferred from an arbitrary FK alone, so service authorization additionally validates role/active status. The database user is not granted app-user impersonation rights.

### 3.3 Native PostgreSQL constraints (migration intent, **not executed SQL**)

Prisma schema alone cannot express the required conditional interval/exclusion guarantees in the chosen design. Part E must keep the following *reviewed migration logic* in a versioned SQL migration, test applying it against a fresh PostgreSQL 18 database, and ensure Prisma-generated migrations **do not drop** these constraints. Actual column names/types must match the implemented schema before applying the snippets.

~~~sql
-- Requires btree_gist to compare UUID equality inside GiST exclusions.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "Slot"
  ADD CONSTRAINT slot_exactly_one_hour
  CHECK ("endsAt" = "startsAt" + INTERVAL '60 minutes');

ALTER TABLE "Slot"
  ADD CONSTRAINT offered_slot_no_overlap_per_tutor
  EXCLUDE USING gist (
    "tutorId" WITH =,
    tstzrange("startsAt", "endsAt", '[)') WITH &&
  )
  WHERE ("lifecycle" = 'Offered');

-- Both cancelled and rescheduled history may refer to a Slot,
-- but at most one current Booked record may occupy it.
CREATE UNIQUE INDEX booking_one_active_per_slot
  ON "Booking" ("currentSlotId")
  WHERE "status" = 'Booked';

ALTER TABLE "Booking"
  ADD CONSTRAINT booked_customer_no_overlap
  EXCLUDE USING gist (
    "customerId" WITH =,
    tstzrange("startsAt", "endsAt", '[)') WITH &&
  )
  WHERE ("status" = 'Booked');

-- Protect the duplicated current appointment interval from diverging
-- from the immutable selected Slot, including reschedule updates.
ALTER TABLE "Slot"
  ADD CONSTRAINT slot_id_window_unique
  UNIQUE ("id", "startsAt", "endsAt");

ALTER TABLE "Booking"
  ADD CONSTRAINT booking_current_slot_window_fk
  FOREIGN KEY ("currentSlotId", "startsAt", "endsAt")
  REFERENCES "Slot" ("id", "startsAt", "endsAt")
  ON UPDATE RESTRICT;
~~~

**Migration preconditions:** all identifiers not-null where needed; UUID columns really use UUID; timestamps use TIMESTAMPTZ; enums/columns have the exact quoted values above or their implemented equivalents. Add explicit FK/indexes for customerId, tutorId, currentSlotId and history/notice references, and check nonblank required values in the appropriate feature contract. The database exclusion predicates are **only** for currently Offered Slots and **only** for Booked Bookings: past *Booked* still counts as active, whereas withdrawn historical Slots do not block new distinct offers (Q32). Adjacent half-open intervals never conflict.

This demonstrates DB-enforced **same-Tutor offered overlap** (Race A), **single active owner per Slot** (Race B) and **same-Customer active time overlap** (Race C), even if different API requests race. A transaction still must establish permitted ownership, validity, lifecycle and cross-table consistency. S2 should consider a deferred constraint trigger or equivalent database-backed integrity test for “Withdrawn Slot has no active Booking”; a naked cross-table read followed by an independent write is not sufficient.

## 4. Time model and business transitions

- **Business timezone:** IANA Asia/Bangkok, UTC+07:00 for all stakeholder-facing date/time calculations and display (BR-029/Q29).
- **Storage/transport:** TIMESTAMPTZ instants in PostgreSQL and RFC 3339 ISO-8601 timestamps with an explicit offset on wire, normalized to UTC Z in JSON responses. Reject timezone-free date-time strings in mutation input. Render with an explicit Asia/Bangkok formatter; browser timezone or clock cannot affect eligibility.
- **Intervals:** half-open [startsAt, endsAt); overlap exactly when a.start < b.end AND b.start < a.end. Exact adjacency is permitted for one Tutor's offers and a Customer's active Bookings (Q06/Q28).
- **Tutor creation:** future 60-minute Slot; do **not** silently apply the **new Booking** 60-minute cutoff to Slot creation; proposed hours, horizon and minute grid stay OD-001..003.
- **New Booking (Q05):** S - T_elig >= **60 min**, equality passes. T_elig is a fresh DB-authoritative instant obtained **inside the transaction after relevant lock/contention waits and immediately before the final guarded write**. It is **not** HTTP arrival time, transaction start time, client time or commit time.
- **Customer cancellation (Q07, S2):** start minus authoritative decision >= **30 min**, equality passes; reopen original Slot but Q05 still applies to later claims.
- **Reschedule (Q10/Q11, S2):** both original appointment and destination start are >= **60 min** away at authoritative decision, equality passes; at most one successful reschedule (Q16).
- **Tutor cancellation (Q18, S2):** start minus authoritative decision >= **60 min**, equality passes; requires meaningful nonblank reason and withdraws Slot.
- **Q30:** status Booked/Cancelled only; Past after interval end is derived, never Completed. How *in-progress* lessons fit the S3 summary is still OD-006.

**Q05 contention example:** 15:00 Slot, request arrives 13:59:59, but waits for a row lock until the authoritative guarded instant is 14:00:01. The request **fails** (59m59s remaining). If the guarded instant is exactly 14:00:00 and all other checks pass, a commit *after* that instant does not itself invalidate eligibility. Always revalidate upon retry of an aborted transaction; do not reuse an earlier T_elig. If any subsequent wait invalidates the notion of a final guard, restart the guard/transaction with a fresh DB time before asserting success.

## 5. Authorization, authentication and data minimization

### 5.1 Server-enforced role and record matrix

Legend: **own** means tied to the authenticated principal/actual entity ownership, **no** means forbidden, **public policy TBD** must not be interpreted as permitted anonymous access. The stage column is the proposed delivery stage, not a claim that code exists.

| Operation | Anonymous | Customer | Tutor/Staff | Stage |
|---|---|---|---|---|
| Submit credentials on login screen | login only | login | login | S1 |
| Get current identity and logout | no | own | own | S1 |
| Publish/read Tutor's restricted Slots/schedule | no | no | own Tutor schedule only | S1 |
| Discover narrow availability | **no unless approved** | authenticated, privacy-filtered | no Customer privilege by Tutor role | S1 |
| Book an eligible offered Slot | no | as authenticated Customer | no | S1 |
| Read private Customer Booking list/detail | no | owned Bookings only | no global Customer lookup | S1 |
| Read Tutor's attached Booking schedule | no | no | own authorized Tutor schedule only | S1 |
| Cancel or reschedule Customer Booking | no | owned eligible Booking only | no via Customer route | S2 |
| Tutor-cancel assigned Booking with reason | no | no | currently assigned Tutor only | S2 |
| Withdraw unoccupied future Offered Slot | no | no | owner Tutor, **no** if active Booking | S2 |
| Read private cancellation notice/reason | no | addressed Customer / owned cancelled Booking only | no unrelated record or prior-Tutor privilege | S2 |
| Tutor Summary counts and lists | no | no | own Tutor scope only | S3 |
| Any foreign Customer/foreign Tutor record | no | no | no | all |

**Every record query is scoped on the server** by session principal + actual customerId/Slot.tutorId, including nested detail IDs, list filters, pagination, exports (if ever approved), and error branches. For Tutor reads join the Booking's current Slot to its actual Tutor; do not grant global Customer visibility. For historical cross-Tutor movement, keep OD-015 closed-by-explicit-decision **before** revealing anything to a former Tutor. Frontend hiding of controls cannot substitute for API checks.

### 5.2 Credential and session contract proposal (OD-005 gate)

1. **Accounts:** pre-provisioned Customer/Tutor accounts for Sprint 1. Validate a canonicalized, uniquely indexed email; use Argon2id with unique salt and configurable reviewed work factors. Never store plaintext passwords, seed shared known production passwords, expose hash fields in JSON or log credentials.
2. **Login:** validate input and account active state, verify Argon2id hash, issue a cryptographically random **at least 256-bit opaque session token** (not a predictable UUID). Persist only a SHA-256 digest with userId, creation, expiration and revocation state. Send raw token only via HttpOnly cookie.
3. **Cookie:** Secure, HttpOnly, SameSite=Lax, Path=/, no Domain in HTTPS production. A non-Secure local-development exception may be used **only** for localhost HTTP and never in production; document the local cookie name/behavior in F-S1-01.
4. **Expiry and invalidation:** **candidate policy for approval:** eight-hour absolute session expiry (no implicit refresh); logout revokes the server-side record immediately; login/new password/session compromise reissues token and revokes affected prior tokens. A protected request checks digest, expiry, revocation, User.isActive and effective role from trusted server data. Do not call this TTL a stakeholder-approved rule.
5. **Browser safeguards:** same-origin production; CSRF token tied to the session plus server Origin/Referer checks for cookie-authenticated mutation routes. Enforce HTTPS and validate reverse-proxy trust configuration. No auth token in browser localStorage or client-controlled role claims.
6. **Failure handling:** use non-enumerating login errors, input size limits and bounded login-attempt protections; specific rate limits/password policy and expiry/refresh decisions require F-S1-01 review under OD-005. Authenticated foreign-record errors disclose no private payload.

**Verification owner:** F-S1-01 / VAL-001, VAL-002 and VAL-034/036; tests include invalid/expired/revoked sessions, inactive user, role bypass, forged ID, stolen/rotated old token, CSRF rejection, unknown email and secret scanning. The System SDS does not assert successful execution.

### 5.3 Data exposure contract

- **Customer availability:** only an approved safe Tutor label/ID, Slot ID and UTC interval, plus agreed availability indication; **never** another Customer's Booking, email/phone, cancellation reason or full restricted schedule.
- **Customer own Booking:** Booking ID, relevant Tutor/Slot/time, status, and only that Customer's approved history/reason. Cross-customer list/detail guesses reveal no data.
- **Tutor schedule:** only owned Slots and permitted Booking fields. Customer identity display remains unapproved; use the minimum necessary representation and obtain approval in F-S1-05 API/UI contracts.
- **Notice (S2):** only the recipient Customer can reread; reason additionally appears in that Customer's cancelled Booking details. Reading must not delete or automatically age-expire it (Q24/25). Data deletion/retention and prior-Tutor history are open OD-008/015.
- **Logs/errors:** redact cookie, token, password/hash, personal Booking and private reason. Emit non-sensitive correlation IDs and structured failure codes only. No raw SQL errors, internal stack traces or secrets in responses.

## 6. Shared API and UI contracts

### 6.1 Shared API conventions (not feature-specific endpoint signatures)

- Same-origin HTTPS JSON; path prefix proposed /api/v1. Auth operations conceptually cover login, current-user retrieval and logout; Slot/availability/Booking endpoints and exact URL/method combinations are **deferred to the relevant Part E api-spec.md**.
- JSON keys use lowerCamelCase; IDs use opaque UUID strings; instants use RFC 3339 UTC strings with Z. Pagination/ordering defaults, safe Tutor labels and detailed request/response DTOs are **not frozen** here (OD-004/009).
- Validate path, query and JSON bodies with Zod and server checks (types, length/size, ISO offset, 60-minute arithmetic, state and identity). Reject unknown privileged identity/status fields; construct writes from trusted session and locked DB records. Parameterize all SQL.
- On successful *mutations*, only return confirmed committed outcomes; do not imply a Booking exists before commit. Read results may become stale; a displayed Available marker is not a lease or lock.
- Standard candidate response envelope:

~~~json
{
  "data": {
    "id": "server-generated-uuid",
    "startsAt": "2026-11-08T08:00:00.000Z"
  },
  "meta": { "requestId": "opaque-correlation-id" }
}
~~~

~~~json
{
  "error": {
    "code": "SLOT_UNAVAILABLE",
    "message": "This appointment is no longer available.",
    "requestId": "opaque-correlation-id"
  }
}
~~~

- **Proposed status vocabulary:** 400 malformed input; 401 no valid session; 403 wrong role without record detail; 404 missing/foreign record when existence would disclose privacy; 409 occupied/stale overlap or rejected conflict; 422 well-formed but invalid field/business condition; 429 rate limit; 500/503 internal or transient persistence failure, sanitized. Exact endpoint-specific mapping and stable error codes belong to Feature SDS/API Spec and tests. Error messages must not reveal whether a foreign Booking exists.
- Use request IDs for tracing. UTC wire timestamps round-trip to Bangkok displays exactly; server determines time comparisons, not the browser. Do not serialize Prisma objects/columns wholesale without response allowlists.

### 6.2 Screen inventory and navigation

| Screen / state | Role and stage | Minimum behavior |
|---|---|---|
| Login / signed-out | Anonymous, S1 | Validated login, generic auth failure, keyboard access and session continuity. |
| Customer availability | Customer, S1 | Tutor + time discovery, loading/empty/no-match/error states, eligibility/refresh indication; bookable-only vs disabled items remains OD-004. |
| Customer Booking confirmation + My Bookings/detail | Customer, S1 | Display only committed Bookings after successful write, own list/detail and accurate Booked/Past; refresh preserves data. |
| Tutor Slot publish and own schedule | Tutor, S1 | Single start input with derived 60-min end, validation/errors, Offered/occupied distinction, own attached Bookings. |
| Customer cancel/reschedule and history | Customer, **S2 proposed** | Cutoffs, one-success quota, retained Booking ID, cross-Tutor selection, no partial confirmation. |
| Tutor cancellation/Slot withdrawal | Tutor, **S2 proposed** | Current assignment/ownership, nonblank reason, distinct cancelled vs withdrawn consequences. |
| In-app notices | Customer, **S2 proposed** | Private read/reread without automatic expiry; no broadcast. |
| Tutor Appointment Summary | Tutor, **S3 proposed** | Matching category counts and lists, correct owner scope; in-progress bucket OD-006. |

**Shared UI conventions:** accessible labeled controls, visible focus, keyboard use, field-level validation plus server error banners, pending/disabled submit state (not a concurrency proof), explicit empty vs no-results states, retry controls for safe reads, confirmation only after committed write, and responsive phone/tablet/desktop layouts. App role navigation is based on current-user API, but API still enforces every permission. Use consistent loading skeletons/spinners, success, stale/conflict, offline, forbidden and not-found states. Avoid silently clearing a form after transient or validation errors; revalidate server-side on resubmit. Proposed performance (p95 <=2.0 s) and keyboard acceptance thresholds are OD-010 and **not approved NFR gates**.

## 7. Transaction protocol and three race proofs

### 7.1 Shared mutation invariants

1. **I-A (Q06):** at most one currently Offered Slot for a Tutor overlaps a given offered interval; one-hour duration, same-Tutor adjacency allowed.
2. **I-B (Q01):** at most one current Booked Booking uses any Slot; a failed attempt leaves no orphan reservation or false success.
3. **I-C (Q28):** one Customer has no overlapping current Booked intervals across Tutors; adjacency allowed.
4. **I-T (Q05/Q29):** time and validity are checked at authoritative post-contention T_elig; exact 60:00 is eligible, 59:59 is not.
5. **I-P (atomic persistence):** all accepted changes are committed together; a rejected, aborted or failed write leaves the previous committed state and non-success response. Past Booked stays Booked.

**Lock hierarchy proposed for every mutation:** acquire any affected User/Customer/Tutor rows in a deterministic order, followed by affected Slot rows in ascending UUID order, followed by existing Booking rows in deterministic order. For new Booking, the Customer row is locked before the selected Slot row; for Tutor Slot creation, the Tutor row is locked before inserting its Slot. Part E must audit *all* later cancellation/reschedule paths to respect this order and prevent deadlocks. Serializable isolation and DB constraints are the final safety net, not merely the lock convention.

### 7.2 Tutor Slot creation (Race A; F-S1-02)

1. Authenticate a live Tutor and validate candidate start/derived end from the request (no client tutorId authority).
2. Begin one database transaction (proposed Serializable); lock that Tutor principal row. Recheck active Tutor identity, future time and any *approved* calendar constraints.
3. Insert Offered Slot. PostgreSQL's conditional GiST exclusion rejects a same-Tutor overlapping Offered window even under simultaneous writers. Adjacent windows or same-time offers by **different** Tutors are permitted when otherwise valid.
4. Commit, then return success; on exclusion/serialization conflict, roll back and return a controlled non-success unless a bounded full retry can legitimately succeed. Never update a historical Withdrawn Slot to Offered.

**Proof:** [Q06, FR-006, BR-006/034, NFR-004](srs.md), F-S1-02, VAL-005, AC-S1-13, VC/TEST-S1-37. Use a synchronized barrier with overlapping starts; inspect committed Slot rows and verify the loser did not create a partial Slot.

### 7.3 Exclusive Booking (Races B/C and Q05; F-S1-04)

1. Authenticate current Customer and validate request contains a Slot reference, not a spoofable customerId/role/start timestamp.
2. Begin one database transaction with **Serializable isolation**. Lock the Customer row first (serializes concurrent claims for that principal), then selected Slot row. Use parameterized queries and deterministic ordering; recheck Customer active state.
3. Re-read Slot lifecycle Offered, immutable interval, occupancy and the Customer's **all-Tutor** Booked intervals inside the transaction. Compute availability from committed Booking relations, not a stale browser list.
4. Once all relevant lock waits end, obtain **fresh clock_timestamp()** from PostgreSQL for T_elig and immediately evaluate Slot.start - T_elig >= 60 minutes. Then perform the guarded insert with currentSlotId and interval copied from the locked Slot. If a relevant wait occurs after the guard, restart/revalidate instead of relying on a stale T_elig.
5. Unique active-slot index blocks a second Customer on the same Slot (B); Customer range exclusion blocks overlapping Booked windows across Tutors (C), including separate application processes. Catch and classify exclusion/unique/serialization errors without treating them as successful claims.
6. Commit the Booking transaction; **only after confirmed commit** send success/Booking ID. A transaction rollback leaves no Booking and does not change occupancy, which is derived from the Booked row.

**Proof B:** Q01, FR-012, BR-001/034; F-S1-04, VAL-010, AC-S1-25 and VC/TEST-S1-25. **Proof C:** Q28, FR-013, BR-028/034; F-S1-04, VAL-011, AC-S1-26 and VC/TEST-S1-26. **Q05 proof:** FR-011, BR-005, VAL-008/009, AC-S1-35 and VC/TEST-S1-39, including an orchestrated lock wait crossing the cutoff. Include same-Customer adjacent intervals as permitted control cases.

### 7.4 Failure, retry, and later transitions

- **Rollback and retry:** handle known PostgreSQL SQLSTATE 40001 (serialization) and 40P01 (deadlock), including their ORM equivalents (Prisma P2034), by rolling back the **whole** transaction, using bounded jittered retries (**three attempts proposed**), reacquiring locks and **resampling T_elig** every time. A unique violation 23505 or exclusion 23P01 indicating a genuine conflicting offer/Booking is a *business conflict*, not permission to spin until one magically succeeds. Exhausted retries produce sanitized non-success. Do not retry non-idempotent effects outside the transaction.
- **Unknown response after possible commit:** network failure is not evidence of rollback. No blind duplicate success or changed Booking ID. In S1, reconcile through authenticated own-Booking reads and preserve invariants; an optional durable idempotency-key/result registry, payload fingerprint, key lifetime and repeated-response behavior remain **OD-013** to approve in F-S1-04/S2 Feature SDS. Never claim exactly-once delivery without such a contract.
- **Injected DB failure:** fail after validation / between scheduled statements, roll back, verify committed Booking and Slot state unchanged and API does not say success (FR-016/018, BR-034, VAL-014).
- **Stale UI:** an earlier Available card can become occupied, withdrawn or too close to start. Reject gracefully and refresh; frontend reservation indicators do not reserve database rows (FR-009/011).
- **Customer cancellation S2:** lock Customer/Slot/Booking deterministically, enforce Q07 at authoritative transaction decision, set Booking Cancelled atomically. The original Offered Slot becomes unoccupied because occupancy is derived; Q05 still gates any new claim (VAL-015/016).
- **Customer reschedule S2:** lock Customer, **both** Slots in UUID order and existing Booking, validate both 60-minute cutoffs, ownership, destination/free status and no conflicting other Customer bookings; atomically change currentSlotId + interval and append UNIQUE BookingHistory. Keep Booking ID; a failed attempt preserves destination, original and one-success allowance (VAL-017..020).
- **Tutor cancellation S2:** lock relevant principals and rows, enforce currently assigned Tutor, Q18 60-minute cutoff and nonblank reason; in one transaction set Booking Cancelled, Slot Withdrawn and one private Notification. Failure leaves all three prior states, no notice (VAL-021..024).
- **Tutor withdrawal S2:** only own unoccupied future Offered Slot -> Withdrawn; no reactivation of historical ID; creating a separate new Slot may overlap the old withdrawn time (VAL-025..027).
- **Summary S3:** use a consistent snapshot or equivalent single-query predicate for count and list under the same Tutor/Booking filters; no inferred Completed. In-progress classification is gated (VAL-028/029).

### 7.5 Minimum real-database verification contract

| Case | Real-DB setup / observable committed assertion | Owner |
|---|---|---|
| Race A (VAL-005) | Same Tutor submits overlapping Offered Slot inserts concurrently under a barrier; at most one currently Offered overlap persists; a distinct Tutor's same-time Slot and same-Tutor adjacency may succeed. | F-S1-02 SDS/STS |
| Race B (VAL-010) | Two Customers concurrently book the same valid Slot; exactly one Booked row after both settle; no two success responses or partial state. | F-S1-04 SDS/STS |
| Race C (VAL-011) | One Customer concurrently claims distinct overlapping Slots from two Tutors; never two overlapping Booked rows; adjacent control case allowed. | F-S1-04 SDS/STS |
| Cutoff after lock wait (VAL-008/009) | Hold a competing lock while server time crosses exactly 60:00; use DB clock, test equality and one-second-late outcomes. | F-S1-04 SDS/STS |
| Persistence fault (VAL-014) | Inject post-validation DB write/commit failure; verify no partial committed Booking, false success or Slot occupancy. | F-S1-04 + SYS-01 |
| Auth/privacy (VAL-002/034/036) | Anonymous, wrong-role, foreign-Booking, foreign-Tutor, client-supplied IDs, revoked session; inspect entire payload, not only UI. | F-S1-01/05 + SYS-01 |
| Durability (VAL-007/031) | Create Slot and Booking through actual UI/API/DB; restart app against same DB; retrieve correct owner-scoped state. | F-S1-02/04/05 + SYS-01 |
| Later regression (VAL-015..029) | S2 cancellation/reschedule/notification and S3 count/list rules; verify required constraints and no identity/time/privacy regression. | Corresponding S2/S3 SDS/STS |

Tests must deliberately synchronize competing transactions, inspect **final committed rows**, include a losing contender and fault rollback, and record database version, setup/seed, command, Git SHA, pass/fail/skip counts and evidence. Pure mocks, Promise.all without synchronized interleaving, or HTTP-only checks are **insufficient** for the race obligations. These are **planned tests, NOT executed results**.

## 8. Reproducible local development and future delivery

### 8.1 Proposed scripts and configuration (not yet present)

Use one npm-workspaces root and two application packages. Proposed scripts to add in Part E, not commands claimed to work today:

~~~text
npm ci                      # install exact locked project dependency graph
npm run db:up               # start local PostgreSQL (Docker Compose or existing service)
npm run db:migrate          # local: Prisma migrate dev incl. reviewed SQL constraints
npm run db:seed             # idempotent LOCAL/TEST-only Customer/Tutor fixtures
npm run dev                 # web + API; Vite same-origin /api proxy
npm run typecheck
npm run lint
npm run test:unit
npm run test:api
npm run test:db             # real PG + barriers + committed-row assertions
npm run test:e2e            # real UI/API/DB flow
npm run build
npm run db:migrate:deploy   # later release: reviewed Prisma migrate deploy
~~~

Document and implement each script before presenting it as runnable. Provide README setup prerequisites (Node 24, npm 11, PostgreSQL 18 or agreed compatible version, Docker optional), exact .env.example placeholders, startup/teardown instructions and fresh DB reset procedure **only for disposable development/test DBs**. Never reset a real or shared database. Use separate TEST_DATABASE_URL, migrations and unique test fixtures to prevent contamination. Seed is **idempotent**, uses only fictional records and does not expose known shared/production account credentials. Tests should use isolated DBs and rollback/cleanup of test fixtures.

### 8.2 Proposed environment variable names (examples, not secrets)

~~~dotenv
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://APP_USER:CHANGE_ME@localhost:5432/nuttiew_dev
TEST_DATABASE_URL=postgresql://TEST_USER:CHANGE_ME@localhost:5432/nuttiew_test
SESSION_COOKIE_NAME=nuttiew_session_dev
SESSION_SECRET=GENERATE_A_STRONG_LOCAL_ONLY_SECRET
TRUST_PROXY=false
WEB_ORIGIN=http://localhost:5173
~~~

All values above are **placeholders**, never deployable credentials. In the proposed opaque-token/digest scheme, a SESSION_SECRET is only required if a separately signed CSRF/session adjunct is approved; do not treat it as a replacement for true random tokens or a reason to store raw sessions. Commit only .env.example and ignore real .env, test output, DB dumps and secrets. Do not place passwords/API keys in sample responses, tests or logs. For deployment use secret management; fail fast when required config is missing. Production cookies require HTTPS, Secure, HttpOnly and a reviewed proxy/host setup.

### 8.3 Database migration and operational readiness

- Create Prisma 7 schema and adapter configuration, include versioned custom SQL for CHECK, partial unique, GiST exclusion and composite FK. Check extension permissions (btree_gist), upgrade compatibility and migration dry-run on a new DB. Use a single migration authority, not Prisma db push on production.
- Index foreign keys/read paths, including Tutor Slots by owner+startsAt, Booking by customer and current slot, and future Notice recipient/time; verify query plans when data size makes it useful. Avoid storing computed Booked/Past or redundant occupancy counters.
- Preserve existing rows as S2/S3 migrations add lifecycle, history and notice features; use additive/default/backfill strategy, then constraints, never destructive drop-and-recreate. Test up/down or safe forward recovery and backup first; rollback a release by correcting forward schema where unsafe to reverse.
- Separate development/test/prod databases and least-privilege accounts. Production migrations run as privileged release step, API uses narrower runtime credentials. Define backup/restore and secret rotation in Lab 5 operations; no retention or uptime SLA invented at D1.

### 8.4 Docker/GCP and CI/CD **future design only**

~~~mermaid
flowchart LR
  PR["Reviewed PR + quality gates (future)"] --> CI["GitHub Actions build / tests"]
  CI --> R["Accepted main release"]
  R --> C["Cloud Run: HTTPS web + API container"]
  C --> DB[("Cloud SQL for PostgreSQL")]
  C --> SM["Secret Manager / service identity"]
~~~

- **Lab 5 target:** build a production image with Node 24, compile React assets, serve the same-origin site and Express API in a Cloud Run service, connect to a supported Cloud SQL PostgreSQL major over an authenticated/private connector, use Secret Manager and service identity. Confirm Cloud SQL major/extension support, SQL connection pooling and migration permissions before implementation.
- **CI plan:** on each PR run lockfile install, typecheck, lint, build, unit/API tests, and real-DB integration/concurrency suites with an ephemeral PostgreSQL service and migrations; record explicit status. Deploy only reviewed/accepted main releases; enforce branch protection and no secrets in PR logs.
- **Scale:** Cloud Run instances are stateless and may overlap; PostgreSQL unique/exclusion and serializable transaction invariants must hold **across instances**, not only one Node process. Session state remains in DB, never a single-process memory map. Cap DB pool size for serverless instance multiplication.
- **Current evidence:** no app image, deployed Cloud Run, Cloud SQL, GitHub Actions quality gate or successful execution was created by Issue #11. The course's supplied Lecture 11 material frames Docker/CI/CD/GCP as later Lab 5 work, not an assertion of delivery.

## 9. Requirements-to-design-to-verification traceability

| Design responsibility | Requirement / feature IDs (authoritative in SRS and inventory) | Planned checks and downstream contract |
|---|---|---|
| Auth, session, role/owner boundaries | FR-001..004; BR-002/033; NFR-001/002/015; F-S1-01 | VAL-001/002/034/036; F-S1-01 Feature SDS/STS, session expiry, CSRF, bad roles/ownership |
| Offered 60-minute Slot / Tutor ownership | FR-005..007; BR-003/004/006/029/035; F-S1-02 | VAL-003/004/005; AC-S1-13; VC/TEST-S1-37; migration constraint and Race A |
| Availability and safe Customer projections | FR-008/009; NFR-007; F-S1-03 | VAL-006/009/036; stale/empty/privacy/refresh UI and API |
| Exclusive Booking and time/concurrency | FR-010..013/018; BR-001/005/028/034; NFR-004/005/006/008; F-S1-04 | VAL-007..011/014/030; AC-S1-25/26/35; VC/TEST-S1-25/26/39; Races B/C, T_elig, retry |
| Persisted private Booking and correct status | FR-014..017/019; BR-030; NFR-003/007; F-S1-05 | VAL-012/013/031/036; restart, owner scope, Past not Completed |
| Cross-cutting system ownership | FR-018/019; BR-029/033/034; NFR-003..008/011/012/013/015; SYS-01 | VAL-014/031/034/035/036; migrations, safe error, CI/GCP future plan |
| Customer cancellation | FR-020/021; BR-007/008; F-S2-01 **proposed** | VAL-015/016; Q05 remains independent after reopen |
| Cross-Tutor one-success reschedule | FR-022..027; BR-009..016; F-S2-02 **proposed** | VAL-017..020; same Booking ID, at most one history, atomic cross-Slot movement |
| Tutor cancellation and withdrawal | FR-028..030/033/034; BR-017..020/026/027/032; F-S2-03/05 **proposed** | VAL-021/022/025..027; no occupied withdrawal, reason and distinct ID |
| Private notice and cancellation reason | FR-031/032; BR-021..025; NFR-014; F-S2-04 **proposed** | VAL-023/024/036; read/reread, no age expiry, data minimization |
| Tutor-only summary | FR-035/036; BR-030/031; NFR-016; F-S3-01 **proposed** | VAL-028/029/036; consistent counts/lists, in-progress decision gate |

**Coverage boundary:** All stakeholder decisions Q01–Q32 are represented through BR-001..032 with extra BR-033..035 for instructor/security/integrity, and FR-001..036 / NFR-001..016 remain controlled by [SRS](srs.md). The detailed ID-to-feature/VAL crosswalk is in [traceability](traceability.md). This SDS adds design mappings and **does not** redefine or renumber any source requirement. VAL, AC and VC/TEST references above are **planned evidence**, not passed tests. Feature-specific exact test lists and acceptance results must be established in each Part E STS.

## 10. Outstanding gates, review checklist and next authorized work

| Gate | Required disposition before the indicated step |
|---|---|
| OD-001/002/003 | Decide Tutor operating hours/days, maximum horizon and start-minute grid **before F-S1-02 final contract**; do not fabricate restrictions. |
| OD-004 | Approve availability display, safe Tutor labels, field allowlists, sorting/filtering and list behavior **before F-S1-03/05 API/UI contracts**. |
| **OD-005** | Peer-approve stack integration, proposed eight-hour Session TTL/CSRF policy, precise API errors, database locks/isolation/SQL constraints and failure handling **before S1 code**. |
| OD-006 | Classify in-progress appointments for Upcoming/Past summary without creating Completed state **before S3 summary contract**. |
| OD-007 | Q32 already **prohibits** reactivation of withdrawn historical Slot; any exception needs *new* stakeholder authority, not a default. |
| OD-008/009 | Privacy retention/deletion and summary count/list snapshot/pagination **before corresponding S2/S3 contracts**. |
| OD-010 | Proposed keyboard/p95 thresholds and DB race stress sample sizes need approved methods/fixtures; not mandatory until approved. |
| **OD-011/012** | Final instructor Master document and formal Theme 1 eligibility **still unverified**, blocking official sign-off; this design may only be reviewed as a draft. |
| **OD-013** | Retry idempotency-key shape/window and unknown-commit reconciliation **before Booking/Reschedule Feature SDS/STS**. |
| OD-014/015 | Meaningful Tutor reason validation and previous-Tutor history visibility **before corresponding S2 design contracts**. |
| Issue #12 | Sprint 2/3 assignment and feasible capacity remain proposed pending peer-reviewed three-sprint plan. |

**Issue #11 review checklist (independent @Chxtamos review required):**

1. Confirm the real repo has no implementation and that this PR changes **only** docs/system-sds.md.
2. Challenge proposed Node/React/Vite/Express/Prisma/Postgres versions and Prisma 7 adapter/migration details; verify reproducible future commands are clearly **not yet executable**.
3. Validate ERD cardinalities, no redundant writable Tutor schedule or occupied flag, immutable 60-minute Slot, FKs, conditional indexes/exclusions and S2 history/notice compatibility.
4. Confirm all three race invariants with DB-executed planned test proof, post-lock Q05 clock semantics, equality/adjoining windows, atomic rollback and bounded retry contract.
5. Confirm anonymous/Customer/Tutor role and **record** enforcement, cookie/token hygiene, CSRF protection, privacy-safe response allowlists and error discipline.
6. Confirm required Q07–Q32 later behavior is represented *without* prematurely exposing Sprint 2/3 endpoints, and OD-001..015 / Master/Theme blockers remain visible.
7. Check source links, consistent IDs, no fabricated test/deployment/approval claims and a substantive GitHub review. An AI self-check is not a teammate approval.

**Exit / handoff:** After a documentation-only diff check and this Issue's scoped review, open a PR from the Issue branch to sprint1, request @Chxtamos and **leave it open**. Only a real teammate's review and an explicitly authorized later merge can satisfy the full Issue DoD. Issue #12 can use this draft for feasibility but cannot claim it is already signed off. Part E should author **versioned feature contracts first**, then implement/test the S1 slice on their own Issue branches.

## 11. References and provenance

- Product authority: [Whole-product SRS](srs.md), [Sprint 1 baseline](requirements.md), [Feature inventory](features.md), [Traceability](traceability.md), [AGENTS.md](../AGENTS.md), [Issue #11](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/11).
- Instructor materials cited by the SRS: Group Work Specification v1, **marked draft**, issued 6 October 2026; Deliverable 1 v1 for 8 November 2026. **Authoritative final Master and Theme allocation not verified** (SRS OD-011/012).
- Version support: [Node.js releases](https://nodejs.org/en/about/previous-releases), [Vite supported releases](https://vite.dev/releases); npm registry version metadata examined 3 November 2026. These justify *proposed* targets, not installed project libraries.
- [PostgreSQL 18 CREATE TABLE / exclusion constraints](https://www.postgresql.org/docs/18/sql-createtable.html) and [range types](https://www.postgresql.org/docs/18/rangetypes.html).
- [Prisma 7 transaction isolation and retry](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions); implementation must validate compatibility with the **chosen** Prisma 7 adapter and API.
- No test execution, generated migration, package installation or cloud deployment was performed **as part of authoring this specification**.
