# F-S3-01 — Tutor Appointment Summary Software Test Specification (Part E)

> **Planned STS only.** No executable test, PostgreSQL run, browser test, or PASS result is included in this Part E document. Execute against disposable PostgreSQL 18 at the reviewed S2 schema SHA and record exact source SHA and results in the implementation PR.

## 1. Traceability and test setup

Sources: [Feature SDS](specification.md), [API](api-spec.md), [Data](data-spec.md), [UI](ui-spec.md), [SRS](../../srs.md) (`Q30`, `Q31`, `FR-035`, `FR-036`, `BR-030`, `BR-031`, `BR-033`, `NFR-001`, `NFR-003`, `NFR-006`, `NFR-007`, `NFR-015`, `NFR-016`, `VAL-028`, `VAL-029`, `VAL-036`, `OD-006`, `OD-009`).

Required Part F setup: disposable PostgreSQL 18 at the reviewed S2 schema SHA; Tutor A, Tutor B, Customer A; live Sessions; real persisted Bookings spanning past-ended (`endsAt <= T_eval`), exact-end boundary (`endsAt === T_eval`), in-progress (`startsAt <= T_eval < endsAt`), upcoming (`startsAt > T_eval`), and cancelled (`status = 'Cancelled'`); controlled `summaryClock` seam for exact boundary testing (use an exact SQL/test-clock timestamp, not a rounded JavaScript Date, for sub-millisecond fixtures); fresh API child process for restart durability.

All cases below are **PLANNED / NOT RUN**.

## 2. Planned STS cases

| ID | Stage | Requirement trace | Setup / action | Expected observable result |
|---|---|---|---|---|
| `SUM-01` | **D2** | `FR-035`; `BR-030/031`; `NFR-016`; `AC-S3-01-01`; `VAL-028` | Tutor A has 2 past-ended `Booked` Bookings (`endsAt` earlier/later; note: `offered_slot_no_overlap_per_tutor` + fixed 60-min slot duration prohibit two distinct `Booked` rows for the same Tutor sharing identical `endsAt`, so `id DESC` tie-breaking is additionally verified via query/projection without violating DB invariants), 1 upcoming `Booked`, 1 `Cancelled`, and Tutor B has 1 past-ended `Booked`. Tutor A calls `GET /api/v1/tutor/summary`. | `200 OK`; `pastBookedCount === 2`, `pastBooked.length === 2`, ordered `endsAt DESC, id DESC`; every row belongs to Tutor A with `status='Booked'`, `displayStatus='Past'`; zero upcoming, cancelled, or Tutor B rows; `X-NutTiew-Session-Binding` and `Cache-Control: no-store` set. |
| `SUM-02` | **D2** | `BR-030`; `NFR-006`; `OD-006`; `AC-S3-01-02`; `VAL-028/029` | Controlled `summaryClock`: Booking 1 has `endsAt === T_eval` (exact boundary); Booking 2 has `startsAt <= T_eval < endsAt` (in-progress, end 1 μs after `T_eval`). Choose a sub-millisecond `T_eval`. | Booking 1 IS included in `pastBooked`; Booking 2 (in-progress) is **excluded** from `pastBooked`; neither asserts `Completed`; returned `meta.evaluatedAt` preserves that exact instant. |
| `SUM-03` | **D2** | `FR-036`; `BR-031/033`; `NFR-001/016`; `AC-S3-01-03`; `VAL-029` | Anonymous caller, authenticated Customer, and Tutor B (with 0 past bookings, under a controlled `summaryClock`) call `GET /api/v1/tutor/summary`. | Anonymous → `401 UNAUTHENTICATED`; Customer → `403 FORBIDDEN`; Tutor B → `200 OK` with `pastBookedCount: 0, pastBooked: []` (zero Tutor A records) and `meta.evaluatedAt` equal to the exact single-statement snapshot timestamp. |
| `SUM-04` | **D2** | `NFR-007/015`; `AC-S3-01-04`; `VAL-036` | Inspect `200` and `400/401/403` payloads for Tutor A with a Tutor-cancelled Booking carrying a private reason and a Customer with known email. | Allowlisted keys only (`id`, `slotId`, `customerRef`, `startsAt`, `endsAt`, `status`, `displayStatus`, `createdAt`); zero Customer email, raw `customerId`, cancellation reason, credentials, SQL, or stack trace. |
| `SUM-05` | **D2** | `AC-S3-01-06` | Tutor A calls `GET /api/v1/tutor/summary?tutorId=<other>` or `?status=Past`. | `400 INVALID_INPUT`; no data returned. |
| `SUM-06` | **D2** | `FR-024/035`; `OD-015`; `AC-S3-01-01` | Booking originally on Tutor A is rescheduled to Tutor B and ends before `T_eval`. Both Tutors call `GET /api/v1/tutor/summary`. | Appears in Tutor B's `pastBooked` (`pastBookedCount: 1`); absent from former Tutor A's `pastBooked` (`pastBookedCount: 0`). |
| `SUM-07` | **D2** | `NFR-003`; `AC-S3-01-05` | Seed persisted Past Booked row, restart API process (`spawn`), and call `GET /api/v1/tutor/summary`. | Exact `pastBookedCount` and matching row persist across API restart. |
| `SUM-08` | **D2** | `AC-S3-01-05`; `NFR-006` | Playwright Edge E2E (non-Bangkok browser timezone `America/Los_Angeles`): Tutor logs in, sees Past Booked count + matching list in `Asia/Bangkok` time (no `Completed` text), reloads page, sees persisted count/list; Customer cannot access summary. | UI count equals list length, Bangkok time preserved, survives reload, no Customer email or `Completed` label. |
| `SUM-09` | **Final** | `FR-035`; `OD-006/009`; `AC-S3-01-07/08`; `VAL-028/029/036` | Seed Upcoming Booked, In-Progress Booked, Past Booked, and Cancelled (both Customer and Tutor actors) under one `T_eval`. | All category counts equal their matching list lengths under one `evaluatedAt`; approved `OD-006` in-progress handling verified; the exact Cancelled DTO allowlist excludes `tutorCancellationReason`, raw Customer identity, and other private fields. Include ties in each Final category to verify its ordering and ID tie-breaker. |
| `SUM-10` | **Final** | `AC-S3-01-09` | Playwright Edge E2E for full three-category Tutor Summary (Upcoming Booked, Past Booked, Cancelled) + empty states + reload. | All three categories render accurately with consistent counts/lists and Bangkok labels. |

## 3. Anchor coverage

- `VAL-028`: `SUM-01`, `SUM-02`, `SUM-09`
- `VAL-029`: `SUM-02`, `SUM-03`, `SUM-09`
- `VAL-036`: `SUM-04` (D2), `SUM-09` (Final Cancelled response)
- `NFR-001/003/006/007/015/016`: `SUM-01..08`

**Status:** PLANNED / NOT RUN.
