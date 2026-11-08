# F-S1-04 — Customer Exclusive Booking Part F implementation and setup

**Issue:** [#16](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/16).
**Sources:**
- Part E approved-design PR [#35](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/35) (`docs/features/F-S1-04/specification.md`, `api-spec.md`, `ui-spec.md`, `transaction-spec.md`, `data-spec.md`, `tests.md`).
- Shared Booking data-foundation Issue [#33](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/33) — Part E PR [#34](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/34) and Part F PR [#36](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/36) (merged to `sprint1` as `f124760e4c4cd5dce8a450d7f4c4478672fc1ff9`, source commit `aecd983fa4d55dae46e8b6c4843c6aa892d36e69`).
- Customer Availability Discovery Issue [#15](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/15) — Part F PR [#37](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/37) (merged to `sprint1` as `0e212bf96beef73050e02bce5e63a926ba15d59d`).

**Scope owner:** @Chxtamos; **peer reviewer:** @Tanaboonnnnn.
This document describes the **Part F code implementation branch** (`feature/16-exclusive-booking`) and does not itself constitute peer-review approval, stakeholder business-rule sign-off, or a Sprint 1 release.

## What the feature implements

- **Exclusive Customer Booking HTTP endpoint (`POST /api/v1/customer/bookings` in `apps/api/src/app.ts`):**
  - Requires a live authenticated Session (`requireSession`) and active `Customer` role (`requireRole('Customer')`).
  - Rejects any query parameter (`Object.keys(req.query).length > 0`) with `400 INVALID_INPUT`.
  - Enforces canonical Origin/Referer and Fetch Metadata (`Sec-Fetch-Site: cross-site`) checks (`403 ORIGIN_DENIED`).
  - Requires `X-NutTiew-Expected-Session-Binding` matching `sessionBinding(principal.userId, principal.sessionId)` before mutation (`403 SESSION_BINDING_MISMATCH`).
  - Enforces Session-bound HMAC CSRF verification via `X-CSRF-Token` (`403 CSRF_DENIED`).
  - Strictly validates the JSON body allowlist (`{"slotId": "<UUID>"}`); rejects extra keys, missing/non-UUID `slotId`, or forged `customerId`/`tutorId`/`id`/`status`/`startsAt`/`endsAt` with `400 INVALID_INPUT` (`BR-S1-20`, `AC-S1-28`, `BOOK-08/09`).
  - Returns `201 Created` only after `COMMIT` acknowledgement for a new Booking, or `200 OK` with the original Booking ID on natural-key `(customerId, slotId)` replay (`OD-013`, `AC-S1-29`, `BOOK-01/13/14/15/16`).
  - Projects the strict response DTO allowlist (`{ data: { id, slotId, startsAt, endsAt, status: 'Booked' }, meta: { requestId } }`) with `Cache-Control: no-store` and UTC RFC 3339 `.toISOString()` (`...sssZ`) timestamps; never discloses `customerId`, `tutorId`, Session/CSRF secrets, SQL diagnostics, or third-party Booking details (`BOOK-20`).
- **PostgreSQL `SERIALIZABLE` Booking Transaction Adapter & Post-Rollback Reconciliation (`apps/api/src/bookings.ts`):**
  - Consumes the canonical `Booking` table, constraints (`booking_one_active_per_slot`, `booked_customer_no_overlap`), and `booking_guard_s1()` trigger delivered by `#33` (`f124760e4c4cd5dce8a450d7f4c4478672fc1ff9`) without duplicating schema, migrations, or triggers.
  - **Step 1 (Unlocked Discovery):** Queries `Slot` (`id`, `tutorId`) without locks to determine the User lock set; missing Slot returns `404 SLOT_NOT_FOUND`.
  - **Step 2 (Single-connection `SERIALIZABLE` attempt):** Checks out one `pg.PoolClient` per attempt and executes `BEGIN ISOLATION LEVEL SERIALIZABLE`.
  - **Step 3 (Ordered `User` locks):** Deduplicates and sorts `[principal.userId, discoveredTutorId]` in ascending UUID order and locks each row with `FOR UPDATE` (`BOOK-22`). Immediately revalidates the Customer row (`!isActive` → `401 UNAUTHENTICATED`; `role !== 'Customer'` → `403 FORBIDDEN`). Retains the Tutor's locked `role`/`isActive` state but defers new-claim Tutor eligibility until after Session revalidation and same-pair replay lookup (`BOOK-33`). If the discovered Tutor row is missing, aborts and restarts discovery (`BOOK-24`).
  - **Step 4 (Ordered `Slot` lock):** Locks the selected `Slot` row with `FOR UPDATE` and verifies `slotRow.tutorId === discoveredTutorId`; if missing or reassigned between discovery and lock acquisition, aborts without acquiring any out-of-order lock and restarts from discovery (`BOOK-24`).
  - **Steps 5 & 6 (Subordinate `Session` lock & DB-clock revalidation after waits):** Locks `Session` (`WHERE id = $1 AND userId = $2 FOR UPDATE`) after all `User` and `Slot` waits. An absent row or owner mismatch rolls back and returns `401 UNAUTHENTICATED` immediately without consuming the retry budget (`BOOK-32`). Then verifies `revokedAt IS NULL AND expiresAt > clock_timestamp()` on the same connection (`BOOK-26/27`).
  - **Step 7 (Natural-key replay precedence):** Queries `Booking` for `(customerId = principal.userId, currentSlotId = slotId, status = 'Booked')`. If a matching row exists with the Slot's interval, commits the read-only transaction and returns `200 OK` with the original Booking ID even if the Tutor was subsequently deactivated or changed role or the Q05 window has passed (`BOOK-13/33`).
  - **Steps 8 & 9 (New-claim Tutor eligibility & conflict checks):** Requires `tutorRow.isActive && tutorRow.role === 'Tutor'` (`409 SLOT_UNAVAILABLE`), checks active Slot occupancy (`409 SLOT_UNAVAILABLE`), and checks positive half-open `[startsAt, endsAt)` overlap for the Customer across all Tutors (`409 CUSTOMER_OVERLAP`), permitting exact adjacency (`BOOK-04/05/06/07`).
  - **Steps 10 & 11 (Guarded `INSERT`, `BDF-23` post-guard contention check, and `COMMIT`):** Executes the `Booked` `INSERT` guarded by `#33` `booking_guard_s1()` (`P0B01 / booking_slot_not_offered` → `409 SLOT_UNAVAILABLE`; `P0B02 / booking_q05_min_notice` → `422 BOOKING_NOT_ELIGIBLE`). Also inspects `clock_timestamp()` returned alongside `INSERT RETURNING`: if an unexpected direct-SQL index wait occurred after `booking_guard_s1()` sampled `T_elig` and crossed the 60-minute Q05 cutoff before `INSERT` completed, aborts (`ROLLBACK`) and restarts the transaction so a fresh attempt re-locks and samples a fresh `T_elig` (`BDF-23`, `BOOK-19`).
  - **Step 12 (Bounded retry & allowlisted `READ COMMITTED` reconciliation):**
    - Retries `40001`, `40P01`, `P2034`, and lock-set changes up to **3 total attempts** with capped exponential jitter; exhaustion returns `503 TRANSACTION_RETRY_EXHAUSTED` (`BOOK-18/23/24`).
    - Strictly allowlists `23505 / booking_one_active_per_slot` (`SLOT_UNAVAILABLE`) and `23P01 / booked_customer_no_overlap` (`CUSTOMER_OVERLAP`) for post-rollback reconciliation; any other `23505`, `23P01`, `0A000`, or unknown constraint fails closed with `500 INTERNAL_ERROR` (`BOOK-31`).
    - On an allowlisted tuple, rolls back and releases the `SERIALIZABLE` client, then opens a fresh `READ COMMITTED` transaction that locks/revalidates `User` (`FOR UPDATE`) first, then locks/revalidates `Session` (`FOR UPDATE` + `clock_timestamp()`), and only for an active Customer with a live Session performs a plain MVCC read for an exact same-pair `Booked` row (`200 OK` if found, otherwise `409 SLOT_UNAVAILABLE` or `409 CUSTOMER_OVERLAP`) (`BOOK-30`).
- **Customer Booking Confirmation UI (`apps/web/src/customer-availability.tsx`, `apps/web/src/main.tsx`, `apps/web/src/customer-availability.css`):**
  - Decouples `GET /api/v1/customer/availability` offer loading from `GET /api/v1/auth/csrf` bootstrap (`loadCsrfBootstrap`): if Availability returns `200` while `/api/v1/auth/csrf` fails (e.g., `503`), the Customer can still browse and select available Slots while **ยืนยันการจอง** remains disabled and `#booking-csrf-error` offers **เตรียมการจองอีกครั้ง** to retry CSRF bootstrap.
  - Bootstraps the Session-bound CSRF token from `GET /api/v1/auth/csrf`, then immediately re-queries `GET /api/v1/auth/me` to verify that `X-NutTiew-Session-Binding` and `user.id`/`user.role` still match before enabling confirmation (`BOOK-28`).
  - When `SESSION_BINDING_MISMATCH` or `CSRF_DENIED` occurs (either during post-CSRF `/api/v1/auth/me` verification or on Booking `POST`), clears protected selection/CSRF state and triggers `onSessionBindingChanged` (`rebootstrapSession` in `main.tsx`) to re-query `GET /api/v1/auth/me` and restart the `/api/v1/auth/csrf` + `/api/v1/auth/me` bootstrap for the active Session (only transitioning to Login if `/api/v1/auth/me` fails with `401`).
  - Adds **ยืนยันการจอง** inside `#selected-offer-summary` sending strictly `{"slotId"}` with `X-CSRF-Token` and `X-NutTiew-Expected-Session-Binding`.
  - Handles submitting state (`กำลังยืนยันการจอง…`), `201 Created` confirmed banner (`จองสำเร็จ` + Booking ID + Bangkok time), `200 OK` replay banner (`ยืนยันการจองเดิมแล้ว` + original Booking ID), `409`/`422` error banners with automatic availability refresh, and `503 BOOKING_OUTCOME_UNKNOWN`/network-loss unknown outcome state that preserves the selected `slotId`, prevents selecting a replacement Slot while unresolved, and offers **ส่งคำขอเดิมอีกครั้ง** (`BOOK-15`).
  - Tracks auth/session epoch and `sessionBinding` across in-flight POST requests and discards late responses after logout or session/account switch (`BOOK-29`).

**Explicitly out of scope:**
- Creating or modifying `Booking` schema, migrations, or database triggers (owned by merged `#33` PR `#36`).
- Customer/Tutor Booking list/detail retrieval endpoints and Tutor schedule `Booked` occupancy projection (owned by Issue `#17` `F-S1-05`).
- Sprint 2 cancellation, rescheduling, slot withdrawal, or `Idempotency-Key` headers/registries.

## Verification commands

```powershell
npm run db:generate
npm run db:migrate
npm test
npm run typecheck
npm run build
node --env-file=.env ./node_modules/vitest/vitest.mjs run --dir apps/api test/bookings.db.test.ts
npx playwright test e2e/booking.spec.ts e2e/availability.spec.ts e2e/auth.stale.spec.ts --reporter=line
```

See [Part F verification ledger](verification-ledger.md) for actual observed command outcomes, `BOOK-01..33` and `BDF-23` evidence, backend PIDs, and lock-order traces.
