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
| `npm run build` | `@nuttiew/api` `tsc` and `@nuttiew/web` `tsc -b && vite build` exit 0 with 0 errors | **PASS** |
| `npx --prefix apps/api vitest run test/retrieval.db.test.ts` | **15 passed / 0 failed** (`RET-01..RET-14`, `RET-17` against real PostgreSQL, including RET-14 OS child process) | **PASS** |
| `npx playwright test e2e/retrieval.spec.ts` | Microsoft Edge browser, **4 passed / 0 failed** (`RET-15`, `RET-15-LATE`, `RET-15-LOGOUT-503`, `RET-16`) | **PASS** |
| `npx playwright test` | Full regression suite, Microsoft Edge browser, **61 passed / 0 failed** across all features | **PASS** |
| `git diff --check` | Zero whitespace or formatting errors | **PASS** |

---

## 2. Technical Discoveries & Review Remediation

1. **Decoupled Tutor Read & Error Lifecycle (`apps/web/src/tutor-slots.tsx`):**
   - Decoupled `refreshSlots` and `refreshBookings` into independent asynchronous routines with dedicated AbortControllers (`pendingSlotsGet`, `pendingBookingsGet`) and generation counters (`slotsVersion`, `bookingsVersion`).
   - Network failure or server error on `GET /api/v1/tutor/bookings` does not discard slot data or display slot list error.
   - Dedicated retry button (`โหลดรายการนัดหมายใหม่`) refreshes bookings independently without triggering slot reload.

2. **Zero DB Trigger Tampering in E2E Fixtures (`e2e/retrieval.spec.ts`):**
   - Eliminated `ALTER TABLE "Booking" DISABLE TRIGGER USER` and DDL tampering.
   - All test slots and bookings are created as canonical future records under 100% active database constraints and canonical `booking_guard_s1()` trigger enforcement.
   - Safe `evaluatedAt` simulation in `RET-15` uses Playwright route interception (`page.route`) to project `displayStatus: 'Past'`, providing historical display evaluation without bypassing database integrity.

3. **Fail-Closed Customer Private Booking UI Lifecycle (`apps/web/src/customer-availability.tsx`):**
   - `clearProtectedState()` immediately resets `myBookings = []`, `selectedBookingDetail = null`, `loadingDetail = false`, and `bookingsError = ''`.
   - Both `fetchMyBookings` and `openBookingDetail` implement dedicated `AbortController` refs, epoch/generation checks (`sessionEpoch.current !== capturedEpoch`), response header validation (`X-NutTiew-Session-Binding`), and DTO shape validation.
   - Under `logoutBusy` or `logoutError`, the `#customer-bookings-section` and detail modal are immediately hidden, displaying an auth-guarded notice.
   - Proven via deterministic E2E tests: `RET-15-LATE` (discarding stale delayed 200) and `RET-15-LOGOUT-503` (fail-closed concealment on logout 503).

4. **Genuine Process Restart Persistence Proof (`RET-14` in `apps/api/test/retrieval.db.test.ts`):**
   - Updated `RET-14` to spawn an actual Node child process via `node:child_process.spawnSync` running `--import tsx --input-type=module -e <childCode>`.
   - The child process creates an isolated pool and ephemeral application instance, performs authentication, executes `GET /api/v1/customer/bookings/:id` over HTTP against the persistent database, writes JSON to stdout, and exits 0, proving persistence across OS process restarts.

5. **Session TimeZone Independence (`RET-17`):**
   - Preserved `statement_timestamp()` as `timestamptz` throughout SQL evaluation comparison (`b."endsAt" <= s_clock.evaluated_at`), converting `AT TIME ZONE 'UTC'` solely during ISO-8601 formatting serialization via `to_char(...)`. Proved identical evaluation under `SET LOCAL TIME ZONE 'UTC'` and `SET LOCAL TIME ZONE 'Asia/Bangkok'`.

---

## 3. STS (`RET-01..RET-17`) Traceability & Verification Matrix

| STS ID | Requirement Trace | Acceptance Criteria | Validation Anchor | Target Layer & File | Observed Result | Status |
|---|---|---|---|---|---|---|
| **RET-01** | `FR-S1-14`, `FR-S1-16`, `BR-S1-01` | **AC-S1-30** | `VC/TEST-S1-28` | API / Database (`retrieval.db.test.ts`) | Customer retrieves own committed Bookings in ascending order (`startsAt ASC, id ASC`); foreign bookings strictly excluded | **PASS** |
| **RET-02** | `FR-S1-14`, `FR-S1-16`, `BR-S1-15` | **AC-S1-30** | `VC/TEST-S1-28` | API / Database (`retrieval.db.test.ts`) | Customer retrieves own single Booking detail by valid UUID (`200 OK`) with full metadata allowlist | **PASS** |
| **RET-03** | `FR-S1-04`, `FR-S1-14`, `BR-S1-15`, `NFR-S1-01` | **AC-S1-31** | `VC/TEST-S1-29` | API / Database (`retrieval.db.test.ts`) | Cross-Customer probe: Customer B requests Customer A's Booking ID; returns safe `404 BOOKING_NOT_FOUND` (no 403 confirmation) | **PASS** |
| **RET-04** | `FR-S1-15`, `BR-S1-16` | **AC-S1-32** | `VC/TEST-S1-30` | API / Database (`retrieval.db.test.ts`) | Tutor retrieves Bookings scheduled on own Slots; pseudonymous `customerRef` formatted (`CUST-` + 8 chars) without PII leakage | **PASS** |
| **RET-05** | `FR-S1-07` | **AC-S1-32** | `VC/TEST-S1-30` | API / Database (`retrieval.db.test.ts`) | Tutor own-slots list (`/tutor/slots`) dynamically projects `occupancy: 'Occupied'` for booked Slot, `'Unoccupied'` for unbooked | **PASS** |
| **RET-06** | `FR-S1-04`, `FR-S1-15`, `BR-S1-16`, `NFR-S1-01` | **AC-S1-33** | `VC/TEST-S1-31` | API / Database (`retrieval.db.test.ts`) | Cross-Tutor schedule isolation: Tutor B cannot inspect or query Tutor A's schedule bookings | **PASS** |
| **RET-07** | `FR-S1-17`, `BR-S1-14`, `BR-S1-22`, `Q30`, `BR-S1-12`, `NFR-S1-06` | **AC-S1-34** | `VC/TEST-S1-32` | API / Database (`retrieval.db.test.ts`) | Elapsed appointment displays `displayStatus: 'Past'`, while database `status` remains strictly `'Booked'`, never `'Completed'` | **PASS** |
| **RET-08** | `FR-S1-04`, `AC-S1-05` | — | `VC/TEST-S1-05` | API Guard (`retrieval.db.test.ts`) | Anonymous callers receive `401 UNAUTHENTICATED` on all customer and tutor retrieval endpoints | **PASS** |
| **RET-09** | `FR-S1-04`, `AC-S1-06` | — | `VC/TEST-S1-06` | API Guard (`retrieval.db.test.ts`) | Role boundary: Authenticated Tutor calling Customer booking endpoints receives `403 FORBIDDEN` | **PASS** |
| **RET-10** | `FR-S1-04`, `AC-S1-06` | — | `VC/TEST-S1-06` | API Guard (`retrieval.db.test.ts`) | Role boundary: Authenticated Customer calling Tutor booking endpoints receives `403 FORBIDDEN` | **PASS** |
| **RET-11** | `NFR-S1-08` | — | — | API Input (`retrieval.db.test.ts`) | Malformed non-UUID in path parameter (`/api/v1/customer/bookings/invalid-id`) returns `400 INVALID_INPUT` | **PASS** |
| **RET-12** | `NFR-S1-08` | — | — | API Input (`retrieval.db.test.ts`) | Unexpected query parameters on list and detail endpoints return `400 INVALID_INPUT` | **PASS** |
| **RET-13** | `NFR-S1-01`, `NFR-S1-08` | — | `VC/TEST-S1-35` | Security / Privacy (`retrieval.db.test.ts`) | Full JSON response inspection: Zero leakage of password hashes, session tokens, or unapproved contact data | **PASS** |
| **RET-14** | `FR-S1-16`, `NFR-S1-03` | **AC-S1-30** | `VC/TEST-S1-28` | Persistence / Process Lifecycle (`retrieval.db.test.ts`) | Server restart persistence: Separate Node child process with dedicated pool reading persistent DB returns identical committed Bookings | **PASS** |
| **RET-15** | `FR-S1-14`, `FR-S1-17`, `BR-S1-12`, `Q29`, `NFR-S1-06`, `NFR-S1-09` | **AC-S1-30**, **AC-S1-34** | `VC/TEST-S1-28`, `VC/TEST-S1-32` | Playwright E2E (`e2e/retrieval.spec.ts`) | Customer browser UI: Navigates to My Bookings, views upcoming & past badges, checks Bangkok time, opens detail modal, dismisses modal, empty state browse transition | **PASS** |
| **RET-16** | `FR-S1-04`, `FR-S1-07`, `FR-S1-15`, `BR-S1-16`, `NFR-S1-01` | **AC-S1-31**, **AC-S1-32** | `VC/TEST-S1-29`, `VC/TEST-S1-30` | Playwright E2E (`e2e/retrieval.spec.ts`) | Tutor browser UI: Inspects schedule bookings; Customer B cannot see Customer A's booking in UI list/modal; direct API probe returns safe 404 | **PASS** |
| **RET-17** | `FR-S1-17`, `BR-S1-22`, `Q30`, `NFR-S1-06` | **AC-S1-34** | `VC/TEST-S1-32` | API / Evaluator (`retrieval.db.test.ts`) | Statement snapshot uniformity, empty list metadata, exact Q30 boundary, and session TimeZone independence (`UTC` vs `Asia/Bangkok`) | **PASS** |
