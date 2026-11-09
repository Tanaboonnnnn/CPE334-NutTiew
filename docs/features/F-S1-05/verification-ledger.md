# F-S1-05 — Part F Verification Ledger (Issue #17)

- **Feature:** Protected Customer Booking Retrieval and Authorized Tutor Schedule View (`F-S1-05`)
- **Linked Issue:** [#17](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/17)
- **Branch:** `feature/17-booking-retrieval` based on `sprint1@b1af0932636cd60b99f029a0d046d2eadf10b587` (merged Part E PR [#41](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/41))
- **Environment:** Local Windows, Node **v24.14.0**, PostgreSQL **17.2** (`btree_gist` **1.7**), Vitest **4.1.12**, Playwright Microsoft Edge
- **Verification Date:** 2026-11-09 (Asia/Bangkok)

---

## 1. Actual Observed Command Outcomes

| Command | Actual Result | Status |
|---|---|---|
| `npm test` | 4 Vitest unit files, **29 passed / 0 failed** (`slot-time`, `client-ip`, `security`, `config`) | **PASS** |
| `npm run typecheck` | `@nuttiew/api` and `@nuttiew/web` TypeScript typechecks exit 0 with 0 errors | **PASS** |
| `npm run build` | `@nuttiew/api` `tsc` and `@nuttiew/web` `tsc -b && vite build` exit 0 | **PASS** |
| `npx --prefix apps/api vitest run test/retrieval.db.test.ts` | **15 passed / 0 failed** (`RET-01..RET-14`, `RET-17` against real PostgreSQL) | **PASS** |
| `npx playwright test e2e/retrieval.spec.ts` | Microsoft Edge browser, **2 passed / 0 failed** (`RET-15` & `RET-16`) | **PASS** |
| `git diff --check` | Zero whitespace or formatting errors | **PASS** |

---

## 2. TDD RED → GREEN Evidence and Technical Discoveries

1. **Database & TDD Red Step (`apps/api/test/retrieval.db.test.ts`):**
   - Authored complete integration suite covering `RET-01..RET-14`, `RET-17` before backend implementation.
   - Initial execution observed **15/15 failed** due to missing retrieval endpoints and helper queries.
   - Implemented `apps/api/src/retrieval.ts` with strict query filtering, `meta.evaluatedAt` evaluation snapshot, pseudonymous `customerRef` formatting (`CUST-` + 8 chars), and updated `apps/api/src/slots.ts` to dynamically project `occupancy: 'Occupied' | 'Unoccupied'`.
   - Re-executed suite: **15/15 passed** in 2.41s.

2. **Session TimeZone Independence (`RET-17` discovery):**
   - In SQL evaluation, using `statement_timestamp() AT TIME ZONE 'UTC'` produces a naive `timestamp without time zone`. When compared against `Booking.endsAt` (`timestamptz`), PostgreSQL converts the naive timestamp according to the session's active `TimeZone` (e.g. `Asia/Bangkok`), introducing a 7-hour discrepancy.
   - **Resolution:** Preserved `statement_timestamp()` as `timestamptz` throughout SQL evaluation comparison (`b."endsAt" <= s_clock.evaluated_at`), converting `AT TIME ZONE 'UTC'` solely during ISO-8601 formatting serialization via `to_char(...)`. Proved identical evaluation under `SET LOCAL TIME ZONE 'UTC'` and `SET LOCAL TIME ZONE 'Asia/Bangkok'`.

3. **Safe 404 Privacy Boundary (`RET-03` / `INV-RET-02`):**
   - Proved that cross-customer queries to `GET /api/v1/customer/bookings/:id` return `404 BOOKING_NOT_FOUND` rather than `403 FORBIDDEN`. Returning 403 would confirm the existence of another customer's booking ID, exposing an ID enumeration vulnerability.

4. **Playwright Edge Browser E2E (`e2e/retrieval.spec.ts`):**
   - Executed full customer lifecycle (`RET-15`): tab switching, Bangkok wall-clock formatting (`Asia/Bangkok`), upcoming/past badges (`ยืนยันแล้ว` vs `สิ้นสุดแล้ว`), detail modal display with UUID, modal dismissal via `Escape` key and close button, and empty state transition to availability browsing.
   - Executed tutor schedule view & privacy isolation (`RET-16`): dynamic occupancy badges (`มีผู้จองแล้ว (Occupied)` vs `ว่าง (เปิดรับจอง)`), pseudonymous `customerRef` projection with zero customer personal data disclosure, and verified Customer B cannot observe Customer A's bookings in UI or retrieve them via direct API probe (`404 BOOKING_NOT_FOUND`).
   - Ran `npx playwright test e2e/retrieval.spec.ts`: **2 passed / 0 failed** in 18.3s.

---

## 3. STS (`RET-01..RET-17`) Verification Matrix

| STS ID | Requirement / AC Trace | Verification Method | Observed Result | Status |
|---|---|---|---|---|
| **RET-01** | `FR-S1-14`, `BR-S1-17`, `AC-S1-31` | `test/retrieval.db.test.ts` | Customer lists own committed bookings in deterministic ascending order (`startsAt ASC, id ASC`); bookings of other customers are strictly excluded | **PASS** |
| **RET-02** | `FR-S1-15`, `AC-S1-32` | `test/retrieval.db.test.ts` | Customer requests detail of own booking by UUID (`200 OK`); returns full item fields including `updatedAt` | **PASS** |
| **RET-03** | `FR-S1-15`, `BR-S1-18`, `AC-S1-32` | `test/retrieval.db.test.ts` + `e2e/retrieval.spec.ts` | Customer requests detail of another customer's booking by UUID: returns safe `404 BOOKING_NOT_FOUND` with zero data disclosure, preventing enumeration | **PASS** |
| **RET-04** | `AC-S1-32` | `test/retrieval.db.test.ts` | Customer requests non-existent UUID: returns safe `404 BOOKING_NOT_FOUND` | **PASS** |
| **RET-05** | `FR-S1-16`, `BR-S1-19`, `AC-S1-33` | `test/retrieval.db.test.ts` | Tutor lists own schedule bookings (`Slot.tutorId = principal.userId` and `Booking.status = 'Booked'`), ordered by `startsAt ASC, id ASC` | **PASS** |
| **RET-06** | `BR-S1-19`, `AC-S1-33`, `NFR-S1-08` | `test/retrieval.db.test.ts` + `e2e/retrieval.spec.ts` | Tutor schedule view data minimization: customer identifier pseudonymized as `customerRef: 'CUST-' + customerId.slice(0, 8)`; customer email and raw UUID are withheld | **PASS** |
| **RET-07** | `Q30`, `AC-S1-34` | `test/retrieval.db.test.ts` | Time-derived "Past" appointment display: when `b.endsAt <= meta.evaluatedAt`, `displayStatus: 'Past'`, while `Booking.status` in database remains strictly `'Booked'` | **PASS** |
| **RET-08** | `NFR-S1-01` | `test/retrieval.db.test.ts` | Anonymous call to `/api/v1/customer/bookings` or `/api/v1/tutor/bookings` returns `401 UNAUTHENTICATED` | **PASS** |
| **RET-09** | `BR-S1-17`, `NFR-S1-01` | `test/retrieval.db.test.ts` | Tutor session calling `/api/v1/customer/bookings` returns `403 FORBIDDEN` | **PASS** |
| **RET-10** | `BR-S1-19`, `NFR-S1-01` | `test/retrieval.db.test.ts` | Customer session calling `/api/v1/tutor/bookings` or `/api/v1/tutor/slots` returns `403 FORBIDDEN` | **PASS** |
| **RET-11** | `NFR-S1-01` | `test/retrieval.db.test.ts` | Malformed booking ID in URL returns `400 INVALID_INPUT` | **PASS** |
| **RET-12** | `NFR-S1-01` | `test/retrieval.db.test.ts` | Unexpected query parameters on GET endpoints return `400 INVALID_INPUT` | **PASS** |
| **RET-13** | `NFR-S1-08` | `test/retrieval.db.test.ts` | Stringified response bodies across all endpoints verify absence of sensitive tokens, password hashes, session IDs, or private customer emails | **PASS** |
| **RET-14** | `FR-S1-16`, `NFR-S1-03` | `test/retrieval.db.test.ts` | Committed Bookings survive complete application process shutdown and connection pool reconnection against persistent DB | **PASS** |
| **RET-15** | `FR-S1-14/15`, `BR-S1-17/18`, `AC-S1-31/32/34` | `e2e/retrieval.spec.ts` | Customer Browser E2E: views private bookings list, Bangkok formatting (`Asia/Bangkok`), upcoming/past badges (`ยืนยันแล้ว` vs `สิ้นสุดแล้ว`), detail modal with UUID, dismisses modal via `Escape` key and close button, empty state browse transition | **PASS** |
| **RET-16** | `FR-S1-16`, `BR-S1-19`, `AC-S1-33` | `e2e/retrieval.spec.ts` | Tutor Browser E2E & Isolation: views dynamic occupancy badges (`มีผู้จองแล้ว (Occupied)` vs `ว่าง (เปิดรับจอง)`), schedule bookings with `customerRef`, Customer B cannot view Customer A bookings in UI or retrieve them via direct API probe (`404 BOOKING_NOT_FOUND`) | **PASS** |
| **RET-17** | `Q30`, `FR-S1-17`, `BR-S1-22`, `NFR-S1-06` | `test/retrieval.db.test.ts` | Single statement evaluation snapshot uniformity, empty list metadata, Q30 exact boundary ($T-1\text{s}$ Booked, $T$ Past, $T+1\text{s}$ Past), and session TimeZone independence | **PASS** |
