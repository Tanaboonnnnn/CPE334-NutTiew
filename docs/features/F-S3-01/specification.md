# F-S3-01 — Tutor Appointment Summary Feature SDS (Part E)

> **Documentation contract only; no application code, migration, executable test, PostgreSQL run or approval is included.** Issue [#121](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/121); owner @Chxtamos, independent reviewer @Tanaboonnnnn. Prepared on `docs/121-f-s3-01-contract-d2-index` from `origin/sprint2` @ `393cbe1383ce9edee3222eda2bac63642ffeb537`. Status: **DRAFT FOR HUMAN REVIEW**.

## 1. Authority and baseline

Sources: [SRS](../../srs.md) (`Q30`, `Q31`, `FR-035`, `FR-036`, `BR-030`, `BR-031`, `BR-033`, `NFR-001`, `NFR-003`, `NFR-006`, `NFR-007`, `NFR-015`, `NFR-016`, `VAL-028`, `VAL-029`, `VAL-036`, `OD-006`, `OD-009`), [Feature Inventory](../../features.md), [Traceability](../../traceability.md), [System SDS](../../system-sds.md) (§§3.1–3.2, 5.3, 9), [Three-Sprint Plan](../../sprints/plan.md) (§§2–5), and the accepted Sprint 1/2 retrieval & cancellation contracts.

**Verified local facts:** `Booking` already persists `status` (`Booked` | `Cancelled`), `startsAt`, `endsAt`, `cancellationActor`, `cancelledAt`, `tutorCancellationReason`, and `currentSlotId -> Slot.tutorId`. No new database table or migration is required for `F-S3-01`. `F-S1-05` already derives `Past` from `b."status" = 'Booked' AND b."endsAt" <= evaluated_at` without asserting `Completed`.

**Sprint 1/2 baseline isolation:** No Sprint 1 or Sprint 2 endpoint, DTO, or database constraint is altered. `F-S3-01` adds a read-only Tutor summary endpoint and Tutor dashboard summary view.

## 2. Staged delivery scope (D2 increment vs mandatory Final)

Per [Three-Sprint Plan](../../sprints/plan.md) §2–4 and [Issue #121](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/121):

- **Full `F-S3-01` contract scope (reviewed in this PR):** All three mandatory `FR-035` categories — **Upcoming Booked**, **Past Booked**, and **Cancelled** — each with an exact count and matching owner-filtered list evaluated under one authoritative PostgreSQL snapshot (`evaluatedAt`).
- **Deliverable 2 (D2) implemented increment (gated on review of this contract):** **Past Booked** count + matching list in real UI → API → persistent PostgreSQL, with `VAL-028` (Past Booked slice), `VAL-029` (authorization + in-progress non-misclassification), and `VAL-036` (privacy allowlist).
- **Mandatory Final completion (due 30 Nov / Final 13 Dec):** **Upcoming Booked** and **Cancelled** counts + matching lists implemented, tested, reviewed, and deployed alongside Past Booked. Upcoming and Cancelled are **mandatory for Final**, never optional polish.

**Out of scope:** Customer summary view (forbidden by `BR-031`/`FR-036`), `Completed`/attendance status (forbidden by `Q30`/`BR-030`), tutor earnings/billing, cross-Tutor admin analytics, CSV/PDF export, and custom date-range pagination beyond `OD-009`.

## 3. Proposed decisions for OD-006 and OD-009 (for teammate review)

1. **OD-006 (In-progress appointment classification, `startsAt <= evaluatedAt < endsAt` while `status = 'Booked'`):**
   - **Proposed rule:** Derive `Past Booked` strictly as `status = 'Booked' AND endsAt <= evaluatedAt` (matching `Q30` and Sprint 1 `F-S1-05`). An in-progress appointment (`startsAt <= evaluatedAt < endsAt`) is **never** counted in `Past Booked` and never labeled `Completed`. For the full three-category Final summary, propose reporting `inProgressCount` / `inProgress` explicitly (or classifying `startsAt > evaluatedAt` as Upcoming and disclosing in-progress separately) so no active lesson is silently dropped or miscounted. For the D2 Past Booked increment, verify that an in-progress `Booked` row is **excluded** from `pastBooked`.
2. **OD-009 (Snapshot, ordering, and pagination):**
   - **Proposed rule:** Evaluate all category counts and row lists in **one single SQL statement** using one PostgreSQL `statement_timestamp()` (`evaluatedAt`) so `count === items.length` is guaranteed atomically per response. Order `pastBooked` newest-ended first (`endsAt DESC, id DESC`), `upcomingBooked` soonest-start first (`startsAt ASC, id ASC`), and `cancelled` newest-cancelled first (`cancelledAt DESC, id DESC`). No pagination in S3 v1 (return full authorized owner set, consistent with `F-S1-05` and `F-S2-04`).

## 4. Invariants

| Invariant | F-S3-01 contract |
|---|---|
| Role | Live active `Tutor` Session only (`requireRole('Tutor')`). Customer → `403 FORBIDDEN`; anonymous → `401 UNAUTHENTICATED`. |
| Ownership | Strictly `Slot.tutorId = principal.userId` via `Booking.currentSlotId`. Never accepts a client `tutorId` parameter. Another Tutor's Bookings never appear. |
| Single snapshot | Count and matching list are derived from the exact same `evaluatedAt` (`statement_timestamp()`) and identical SQL predicates (`NFR-016`). |
| Past definition | `status = 'Booked' AND endsAt <= evaluatedAt`. Never asserts `Completed` or attendance (`BR-030`). |
| Privacy | Uses opaque `CUST-xxxxxxxx` reference (`'CUST-' + customerId.slice(0, 8)`). Never exposes Customer email, password hash, cancellation reason, notification IDs, or foreign Tutor records (`NFR-007`). |
| Historical Tutor reassignment | Only Bookings whose `currentSlotId -> Slot.tutorId = principal.userId` appear; a Booking rescheduled away from Tutor A to Tutor B belongs to Tutor B's summary, not Tutor A's (`OD-015`). |

## 5. Acceptance criteria (feature-level, stable IDs)

| ID | Delivery stage | Acceptance criterion |
|---|---|---|
| `AC-S3-01-01` | **D2** | Authenticated Tutor retrieves `pastBookedCount` and `pastBooked` matching list where every row has `status='Booked'`, `displayStatus='Past'`, `endsAt <= evaluatedAt`, and `Slot.tutorId = principal.userId`, with `pastBookedCount === pastBooked.length`. |
| `AC-S3-01-02` | **D2** | Boundary & in-progress safety: a `Booked` Booking with `endsAt = evaluatedAt` is included in `pastBooked`; a `Booked` Booking with `startsAt <= evaluatedAt < endsAt` (in-progress) or `startsAt > evaluatedAt` (upcoming) or `status='Cancelled'` is **excluded** from `pastBooked`; no row ever claims `Completed`. |
| `AC-S3-01-03` | **D2** | Authorization: anonymous caller → `401 UNAUTHENTICATED`; authenticated Customer → `403 FORBIDDEN`; Tutor B sees only Tutor B's own summary rows (never Tutor A's). |
| `AC-S3-01-04` | **D2** | Privacy (`VAL-036` / `NFR-007`): response contains only allowlisted fields (`id`, `slotId`, `customerRef`, `startsAt`, `endsAt`, `status`, `displayStatus`, `createdAt`); zero Customer email, cancellation reason, credentials, SQL, or stack trace. |
| `AC-S3-01-05` | **D2** | Durability & UI (`NFR-003`): Tutor UI renders Past Booked count and matching list in `Asia/Bangkok` time from live API/DB, survives page reload and API process restart, and shows an honest empty state when count is 0. |
| `AC-S3-01-06` | **D2** | Query hygiene: non-empty query string or tampered client parameters → `400 INVALID_INPUT`. |
| `AC-S3-01-07` | **Final** | `upcomingBookedCount` + `upcomingBooked` list (`status='Booked' AND startsAt > evaluatedAt`, plus approved `OD-006` in-progress handling) match identically under the same `evaluatedAt`. |
| `AC-S3-01-08` | **Final** | `cancelledCount` + `cancelled` list (`status='Cancelled'`, showing actor `Customer`/`Tutor` and `cancelledAt` without leaking private Tutor cancellation reason back into summary if restricted) match identically under the same `evaluatedAt`. |
| `AC-S3-01-09` | **Final** | Full three-category Tutor UI displays Upcoming Booked, Past Booked, and Cancelled counts and matching lists consistently under one snapshot without claiming `Completed`. |

## 6. Independent review checklist

- [ ] Confirm `F-S3-01` D2 increment (Past Booked) vs mandatory Final scope (Upcoming Booked + Cancelled).
- [ ] Confirm proposed `OD-006` in-progress classification (excluded from Past Booked; explicit handling for Final).
- [ ] Confirm proposed `OD-009` single-snapshot `statement_timestamp()` and ordering rules.
- [ ] Confirm `requireRole('Tutor')`, owner-only `Slot.tutorId = principal.userId`, and `CUST-xxxxxxxx` privacy allowlist.
- [ ] Confirm no code, migration, executable test, or PASS result is claimed by this Part E PR.
