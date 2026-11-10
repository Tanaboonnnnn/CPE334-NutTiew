# F-S1-03 — Part F verification ledger (Issue #15)

**Code commit:** `8dfdd23ee05efc9c80e2fd5c72c632f37c779bc3`,
**Branch:** `feature/15-customer-availability` based on merged `sprint1` `f124760e4c4cd5dce8a450d7f4c4478672fc1ff9` (which includes Part E PR [#32](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/32) `98d9841227b69820714492c276bcbe402cc21330` and Shared Booking Data Foundation Issue [#33](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/33) Part F PR [#36](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/36)).
**Scope:** Part F implementation of the reviewed Part E Customer Availability contract (`F-S1-03`).
**Execution:** 2026-11-08 (Asia/Bangkok), local Windows, Node **v24.14.0**, PostgreSQL **17.2** (`btree_gist` **1.7**) on a disposable local test database, Prisma Client **7.10.1**, Vitest **4.1.12**, Microsoft Edge Playwright.
Source setup: [implementation.md](implementation.md).

## Actual observed command outcomes

| Command | Actual result | Status |
|---|---|---|
| `npm run db:generate` | Prisma Client 7.10.1 generated from current schema (`User`, `Session`, `AuthAttemptBucket`, `AuthAttemptReservation`, `Slot`, `Booking`) | **PASS** |
| `npm run db:migrate` | Applied `20261105000000_tutor_slots` and `20261107000000_booking_foundation` cleanly; 3 migrations present, no pending migrations | **PASS** |
| `npm test` | 4 Vitest unit files, **29 passed / 0 failed** (`slot-time`, `client-ip`, `security`, `config`) | **PASS** |
| `npm run typecheck` | `@nuttiew/api` and `@nuttiew/web` TypeScript checks exit 0 | **PASS** |
| `npm run build` | `@nuttiew/api` `tsc` and `@nuttiew/web` `tsc -b && vite build` exit 0 | **PASS** |
| `npx --workspace=@nuttiew/api vitest run test/availability.db.test.ts` | **8 passed / 0 failed** (`AVA-01..10`, `AVA-14..18` against real PostgreSQL + committed `Slot`/`Booking` rows) | **PASS** |
| `npx --workspace=@nuttiew/api vitest run test/auth.db.test.ts test/auth.extended.db.test.ts test/guards.db.test.ts test/auth.boundary.db.test.ts test/auth.barrier.db.test.ts test/auth.crash.db.test.ts test/auth.http-clock.db.test.ts test/slots.db.test.ts test/slots.race.db.test.ts test/slots.restart.db.test.ts test/availability.db.test.ts` | 11 PostgreSQL integration files, **51 passed / 0 failed** (30 Auth + 13 Slot/Race A/restart + 8 Customer Availability) | **PASS** |
| `node --env-file=.env ./node_modules/vitest/vitest.mjs run --dir apps/api test/booking.foundation.db.test.ts` | **24 passed / 1 failed** on local PostgreSQL **17.2**: `BDF-16` expects SQLSTATE `23001` (emitted by PostgreSQL 18 for `ON DELETE RESTRICT`), whereas local PostgreSQL 17.2 emits `23503` on the same `booking_customer_fk` constraint. No `#33` files were modified in `#15`; GitHub Actions CI runs PostgreSQL 18. | **OBSERVED (PG 17 vs PG 18 SQLSTATE difference on #33 test)** |
| `npx playwright test e2e/availability.spec.ts --reporter=line` | Microsoft Edge browser, **7 passed / 0 failed** (`AVA-01..10`, `AVA-12`, `AVA-13`, `AVA-15..19`, including malformed 200 validation and Customer logout-uncertain tests) | **PASS** |
| `npx playwright test e2e/tutor.dashboard.spec.ts --reporter=line` | Microsoft Edge browser, **25 passed / 0 failed** (including `UX-R6` role separation with Customer workspace) | **PASS** |
| `npx playwright test e2e/auth.spec.ts e2e/slots.spec.ts --reporter=line` | Microsoft Edge browser, **14 passed / 0 failed** (7 Auth + 7 Slot) | **PASS** |
| `git diff --check` | Zero whitespace or formatting errors | **PASS** |

## TDD RED → GREEN evidence

1. **API & PostgreSQL integration (`apps/api/test/availability.db.test.ts`):**
   - **RED 1:** Executed `npx --workspace=@nuttiew/api vitest run test/availability.db.test.ts` before creating `apps/api/src/availability.ts`; failed with `Error: Cannot find module '../src/availability.js'`.
   - **RED 2:** Created `apps/api/src/availability.ts` before mounting the route in `apps/api/src/app.ts`; `listCustomerAvailability` direct DB tests passed (`2 passed`), while all HTTP route tests failed (`6 failed`) with `expected 404 to be 200 / 401 / 403 / 400`.
   - **GREEN:** Mounted `GET /api/v1/customer/availability` in `apps/api/src/app.ts` with `requireSession`, `requireRole('Customer')`, query-parameter rejection (`400 INVALID_INPUT`), `X-NutTiew-Session-Binding`, and `503 SERVICE_UNAVAILABLE` error mapping. Re-ran `test/availability.db.test.ts`: **8/8 PASS**.
2. **Customer Availability React UI & Edge E2E (`e2e/availability.spec.ts`):**
   - **RED:** Executed `npx playwright test e2e/availability.spec.ts --reporter=line` before mounting `CustomerAvailability` in `apps/web/src/main.tsx`; failed at `expect(page.getByRole('heading', { name: 'เลือกช่วงเวลาติว' })).toBeVisible()` because Customer login still rendered only the Auth placeholder card.
   - **GREEN:** Implemented `apps/web/src/customer-availability.tsx`, `apps/web/src/customer-availability.css`, and mounted `CustomerAvailability` for authenticated `Customer` sessions in `apps/web/src/main.tsx`. Re-ran `e2e/availability.spec.ts`: **5/5 PASS**, and `e2e/tutor.dashboard.spec.ts`: **25/25 PASS**.

## STS (`AVA-01..19`) verification matrix

| STS ID | Requirement / AC trace | Verification method | Observed result | Status |
|---|---|---|---|---|
| **AVA-01** | `FR-S1-08`, `AC-S1-15`, `VC/TEST-S1-15` | Real PostgreSQL + HTTP (`availability.db.test.ts`) + Edge E2E (`availability.spec.ts`) | Returns `200 OK` with opaque `tutorRef`, `slotId`, UTC `startsAt`/`endsAt`, and `meta.evaluatedAt`; UI renders Bangkok date/time and `tutorRef` | **PASS** |
| **AVA-02** | `FR-S1-09`, `AC-S1-16`, `BR-S1-08/21`, `VC/TEST-S1-22` | Real committed `Booking` (`status = 'Booked'`) in PostgreSQL + Edge E2E | Occupied Slot excluded from `data`; unoccupied Slot remains; zero Customer/Booking details leaked | **PASS** |
| **AVA-03** | `FR-S1-09`, `AC-S1-16`, `BR-S1-07/11`, `OD-002`, `VC/TEST-S1-17/18` | Controlled DB `T_view` (`2027-03-10T08:00:00.000Z`) in `availability.db.test.ts` | Past (`-60m`), `+59m59s`, and `+60d 1m` (`> 60 days`) Slots excluded; exact `+60m00s` (`Q05` lower boundary) and exact `+60 days` (`OD-002` upper boundary) Slots included | **PASS** |
| **AVA-04** | `AC-S1-18`, `BR-S1-12`, `VC/TEST-S1-13` | DB connection `TimeZone` set to `UTC` vs `Asia/Bangkok` (`availability.db.test.ts`); Edge browser contexts in `America/Los_Angeles`, `UTC`, and `Asia/Bangkok` (`availability.spec.ts`) | Wire `startsAt`, `endsAt`, and `meta.evaluatedAt` are byte-for-byte identical UTC `...sssZ` strings under both DB session timezones; UI displays identical `Asia/Bangkok` wall-clock times (`10:15–11:15`, `23:30–00:30` + `สิ้นสุดในวันถัดไป`) in all 3 browser timezones | **PASS** |
| **AVA-05** | `FR-S1-08`, `NFR-S1-01/08`, `VAL-036` | Full JSON allowlist inspection in `availability.db.test.ts` + DOM text check in `availability.spec.ts` | Top-level keys strictly `data, meta`; item keys strictly `slotId, tutorRef, startsAt, endsAt`; `meta` keys strictly `requestId, evaluatedAt`; no `tutorDisplayName`, email, Customer ID, or Booking fields | **PASS** |
| **AVA-06** | `BR-S1-17`, `NFR-S1-01`, `VC/TEST-S1-05/06` | HTTP + Edge E2E (`availability.db.test.ts`, `availability.spec.ts`) | Anonymous receives `401 UNAUTHENTICATED`; authenticated `Tutor` receives `403 FORBIDDEN` and sees Tutor Dashboard, never Customer Availability | **PASS** |
| **AVA-07** | `BR-S1-20`, `NFR-S1-01` | HTTP + Edge E2E (`?customerId=...`, `?tutorId=...`, `?role=Tutor`, `?page=1`, `?foo=bar`) | Every query parameter rejected with `400 INVALID_INPUT` and `Cache-Control: no-store` | **PASS** |
| **AVA-08** | `AC-S1-15`, `NFR-S1-07`, `OD-AV-03` | Same-timestamp offers from two Tutors + later offers in `availability.db.test.ts` and `availability.spec.ts` | Deterministic `startsAt ASC, tutorRef ASC, slotId ASC` order verified on wire and in DOM | **PASS** |
| **AVA-09** | `AC-S1-15`, `NFR-S1-07/08`, `OD-AV-04` | Controlled DB `T_view` with zero eligible offers under DB `TimeZone = 'UTC'` and `'Asia/Bangkok'` (`availability.db.test.ts`) + Edge E2E (`availability.spec.ts`) | Both return `200 OK`, `data: []`, identical `meta.evaluatedAt` (`2035-01-01T00:00:00.000Z`), and `Cache-Control: no-store`; UI renders `ยังไม่มีช่วงเวลาติวที่พร้อมให้เลือก` | **PASS** |
| **AVA-10** | `FR-S1-18`, `NFR-S1-07/08` | Closed `pg.Pool` `503` test (`availability.db.test.ts`) + initial GET `503` and failed retry followed by recovery in Edge E2E (`availability.spec.ts`) | Returns `503 SERVICE_UNAVAILABLE` (never `200 []`); UI shows error alert + `โหลดอีกครั้ง` without claiming empty/zero, then restores offers on successful retry | **PASS** |
| **AVA-11** | `AC-S1-17`, `FR-S1-09/11` | End-to-end stale-offer rejection by `#16` Booking transaction | UI transient selection state (`#selected-offer-summary` stating selection is not a Booking) is implemented and clears when unmounted or refreshed, but the real Booking `POST` endpoint/transaction belongs to Issue [#16](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/16) | **BLOCKED on #16 Part F Booking endpoint** |
| **AVA-12** | `NFR-S1-01/08`, `BR-S1-20` | Edge E2E (`availability.spec.ts`) holding an authorized C1 `200 OK` across Logout and injecting a mismatched `X-NutTiew-Session-Binding` header | Held C1 response never repaints after Logout; mismatched `X-NutTiew-Session-Binding` immediately clears offers/selection and returns to signed-out Auth | **PASS** |
| **AVA-13** | `NFR-S1-09`, `VAL-033` | Automated Edge E2E across `320`, `375`, `768`, and `1280` CSS px viewports (`availability.spec.ts`) | Zero horizontal overflow (`scrollWidth <= innerWidth`) at all 4 widths; primary buttons measured `>= 44×44` CSS px; keyboard `Tab`/`Enter` selection and `3px solid rgb(170, 69, 25)` (`#AA4519`) focus outline verified; computed sRGB contrast ratios verified (`14.09:1` brand on sidebar, `15.11:1` heading on canvas, `16.04:1` hours/tutorRef on surface, `5.76:1` primary button text on `#F47736`, `4.59:1` refresh button border on surface). Manual human WCAG 2.2 AA audit remains **NOT RUN**. | **PARTIAL (Automated browser pass; manual human WCAG 2.2 AA audit NOT RUN)** |
| **AVA-14** | `NFR-S1-10`, `VC/TEST-S1-36`, `OD-AV-07` | 5 warm-up + 40 measured sequential `GET /api/v1/customer/availability` requests in `availability.db.test.ts` | Isolated run: `p50 = 4.69 ms`, `p95 = 5.58 ms`, `max = 6.45 ms`. Concurrent 11-file DB suite run: `p50 = 12.91 ms`, `p95 = 16.66 ms`, `max = 18.98 ms` (`<= 2.0 s` reference noted as non-blocking) | **PASS (Recorded)** |
| **AVA-15** | `FR-S1-09/13`, `AC-S1-16`, `BR-S1-09`, `Q28`, `VAL-011` | Real committed C1 `Booked` row (`08:00–09:00 UTC` on Tutor A) vs free Tutor C Slot (`08:30–09:30 UTC`) in `availability.db.test.ts` & `availability.spec.ts` | Overlapping Tutor C Slot is excluded for C1 without disclosing the conflicting Booking, while remaining visible to C2 | **PASS** |
| **AVA-16** | `FR-S1-09/13`, `AC-S1-16`, `BR-S1-10`, `Q28` | Real committed C1 `Booked` row (`08:00–09:00 UTC`) vs free Tutor B Slot (`09:00–10:00 UTC`) in `availability.db.test.ts` & `availability.spec.ts` | Half-open `[start, end)` adjacent Slot (`09:00–10:00 UTC`) is included for C1 | **PASS** |
| **AVA-17** | `FR-S1-09/13`, `BR-S1-09/10`, `Q28` | Real committed C1 `Cancelled` row (`11:00–12:00 UTC`) and C2 `Booked` row on another Tutor's Slot (`08:30–09:30 UTC`) in `availability.db.test.ts` & `availability.spec.ts` | Both control Slots remain included for C1; only `customerId = principal.userId AND status = 'Booked'` triggers Customer-overlap exclusion | **PASS** |
| **AVA-18** | `FR-S1-08`, `NFR-S1-01/08`, `OD-AV-02` | Pre-approval negative check in `availability.db.test.ts` & `availability.spec.ts` | Confirmed no `tutorDisplayName` property is emitted and no email prefix or synthetic name is derived on API or UI. Positive display-name path remains gated behind `OD-AV-02`. | **PASS (Pre-approval negative gate); BLOCKED on OD-AV-02 for positive display-name path** |
| **AVA-19** | `OD-AV-08`, `AC-S1-15` | Computed CSS token comparison between `.customer-app` and `.tutor-app` in `availability.spec.ts` | Verified identical `fontFamily`, `canvasBg` (`rgb(247, 248, 251)`), `sidebarBg` (`rgb(32, 43, 68)`), `surfaceBg` (`rgb(255, 255, 255)`), `primaryBtnBg` (`rgb(244, 119, 54)`), `primaryBtnColor` (`rgb(23, 33, 55)`), and `primaryBtnBorder` (`rgb(217, 97, 35)`) across Customer Availability and Tutor Dashboard | **PASS** |

## Open gates and items NOT RUN

- **`AVA-11` (end-to-end stale selection rejection during Booking confirmation): BLOCKED on Issue [#16](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/16) Part F.** Issue `#15` is strictly a read-only availability discovery slice and must not create a Booking mutation endpoint.
- **`AVA-18` positive `tutorDisplayName` path: BLOCKED on `OD-AV-02` data-approval gate.** Until Tutor opt-in consent, stakeholder publication approval, and a separate forward-only migration adding `User.tutorDisplayName` are approved, `tutorRef` UUID is the sole Tutor identifier.
- **Manual human WCAG 2.2 AA audit: NOT RUN.** Automated Playwright checks verify computed contrast samples, keyboard `Tab`/`Enter` selection, `3px solid #AA4519` focus outline, `>= 44×44` CSS px target boxes, and `320/375/768/1280` CSS px reflow without horizontal overflow, but do not replace a manual human accessibility sign-off.
- **Peer review and merge:** Awaiting independent human review by `@Tanaboonnnnn` on the Issue `#15` Part F PR [#37](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/37) targeting `sprint1`.

## GitHub Actions CI diagnosis and test-selector fix (LOOP 5)

Initial hosted CI run [#42495839211](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/42495839211) at `09dcebcfc6e8e21a5a4f246aaa512f163fdeb402` completed with **2/3 jobs PASS**:

- **Unit / types / build:** **SUCCESS** (25s).
- **PostgreSQL 18 / Auth / Slot / Race A:** **SUCCESS** (41s) on PostgreSQL 18.6 — all 12 PostgreSQL integration files (including `booking.foundation.db.test.ts` `BDF-01..26` and `availability.db.test.ts` `AVA-01..10, 14..18`) passed cleanly.
- **Microsoft Edge / Auth / Tutor UI E2E:** **FAILURE, 51/52 passed**. In `e2e/availability.spec.ts` (`AVA-13/19`), after pressing `Enter` to select `slotMorningAId` (`aria-pressed="true"`), `document.querySelector('.offer-select-button')` on a fresh CI database matched that newly selected first row (`background: rgb(255, 216, 194)`, `border: rgb(164, 62, 20)`) instead of an unselected primary CTA button (`rgb(244, 119, 54)`).
- **Surgical fix (`e2e/availability.spec.ts` only):** Changed the token probe selector from `.offer-select-button` to `.offer-select-button[aria-pressed="false"]` so `AVA-19` compares unselected primary CTA tokens consistently on both fresh and pre-populated databases. No application code or CSS changed.

## PR #37 requested-changes remediation — 2026-11-08 (Asia/Bangkok)

**Reviewer:** @Tanaboonnnnn, [requested-changes review](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/37#pullrequestreview-3433550000).

### 1. [P2] Availability response content shape & timestamp validation
- **Issue:** `fetchAvailability` previously accepted any `data: []` array and cast it to `AvailabilityResponse` without validating that each offer element possessed valid string properties and parseable dates. Malformed payloads (e.g. `data: [{}]` or invalid `meta.evaluatedAt`) reached `new Date(...)` in the React tree and threw `RangeError: Invalid time value`.
- **Resolution (`apps/web/src/customer-availability.tsx`):** Added explicit runtime shape assertions (`isValidUtcIso` and `isValidAvailabilityOffer`) checking non-empty `slotId`, `tutorRef`, UTC ISO strings for `startsAt` and `endsAt` with `startsAt < endsAt`, and valid `meta.evaluatedAt` ending in `Z`. If any field fails, `INVALID_AVAILABILITY_RESPONSE` is thrown, catching into `listError` with `โหลดอีกครั้ง` retry without committing malformed state to React. Added state guard `hasConfirmedResponse` so `ยังไม่มีช่วงเวลาติวที่พร้อมให้เลือก` is only rendered upon receiving an authorized, verified empty 200 response.
- **E2E verification (`e2e/availability.spec.ts`):** Added `AVA-10 malformed 200 payload (invalid offer fields or unparseable date) fails safely into read error and retry without crashing`, verifying both `data: [{}]` and `meta: { evaluatedAt: 'invalid-date' }` produce the safe `#availability-error` retry container without unhandled render errors, and recover smoothly on retry (**1/1 PASS**).

### 2. [P2] Guarded Customer session logout transitions
- **Issue:** When a Customer clicked `ออกจากระบบ`, `handleLogout()` cleared protected offers while `main.tsx` retained `user` and `sessionBinding` during pending/failed logout (`503`), causing the UI to render a false confirmed-empty list (`ยังไม่มีช่วงเวลาติวที่พร้อมให้เลือก`) with an active `เข้าสู่ระบบแล้ว` banner.
- **Resolution (`apps/web/src/main.tsx` & `apps/web/src/customer-availability.tsx`):**
  - Generalized `tutorPhase` and `suspendedTutorId` in `main.tsx` to `sessionPhase` (`'active' | 'logout-pending' | 'logout-uncertain' | 'rechecking'`) and `suspendedUser` (`{ id, role }`).
  - Initiating `logout()` now immediately suspends the active view for both Customer and Tutor, displaying the session guard screen ("กำลังตรวจสอบคำขอและความปลอดภัยของเซสชัน…").
  - On failed logout (503 / network failure), the session guard screen displays the alert ("ไม่สามารถยืนยันการออกจากระบบได้ กรุณาลองอีกครั้งหรือตรวจสอบเซสชัน") with "ลองออกจากระบบอีกครั้ง" and "ตรวจสอบเซสชัน" actions.
  - Implemented `verifyCustomerAvailability` in `recheckSession()`, checking `/api/v1/auth/me` and the availability endpoint with the expected session binding before restoring the Customer workspace.
- **E2E verification (`e2e/availability.spec.ts`):** Added `AVA-12 Customer logout failure stays guarded and private; retry succeeds and recheck restores genuine offers`, verifying that on 503 logout failure, offers and account status are hidden, no empty schedule is claimed, the guard screen appears, and recheck restores the live schedule (**1/1 PASS**). Full Tutor Dashboard suite was rerun to confirm zero regression (**25/25 PASS**).

### 3. [P3] Implementation guide terminology correction
- **Resolution (`docs/features/F-S1-03/implementation.md` & `verification-ledger.md`):** Removed unsupported reference to `onInvalidateSelection` (retaining transient UI selection only; server-side revalidation is owned by #16), and corrected cross-tab notification description from `BroadcastChannel` to `window.localStorage` `storage` events (`nuttiew-auth-changed`).

## Issue #44 Stage 2 (Part F) — Option A Monthly Calendar UX Follow-up (2026-11-10)

**Issue:** [#44](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/44) (UX follow-up linked to [#15](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/15) & [#16](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/16)).
**Branch:** `feature/44-customer-calendar-ux` based on `sprint1` `567ec1cc6ba17c9145568296631e99c4e4518aa1` (Stage 1 docs-only Part E amendment PR [#45](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/45)).
**Scope:** Stage 2 Part F React/CSS implementation of Option A — Date-First Monthly Calendar ([`customer-availability-calendar.ts`](../../../apps/web/src/customer-availability-calendar.ts), [`customer-availability.tsx`](../../../apps/web/src/customer-availability.tsx), [`customer-availability.css`](../../../apps/web/src/customer-availability.css)), unit tests wired to root `npm test` ([`customer-availability-calendar.test.ts`](../../../apps/web/test/customer-availability-calendar.test.ts)), `AVA-14` `500+` seeded PostgreSQL latency benchmark ([`availability.db.test.ts`](../../../apps/api/test/availability.db.test.ts)), `UX-CAL-01..10` Playwright Edge verification ([`availability.calendar.spec.ts`](../../../e2e/availability.calendar.spec.ts) & [`availability-calendar-helper.ts`](../../../e2e/availability-calendar-helper.ts)), and impacted regression selector updates (`e2e/availability.spec.ts`, `e2e/booking.spec.ts`, `e2e/sprint1.journey.spec.ts`).
**Unchanged boundaries:** Zero changes to `apps/api/src/` (retains unfiltered `GET /api/v1/customer/availability`, `400 INVALID_INPUT` on query params, `OD-002` 60-day `T_view` horizon, `OD-AV-02` opaque `tutorRef`, `F-S1-04` booking/CSRF/SQL guarantees, `F-S1-05` `การจองของฉัน` tab) and zero changes to Deliverable 1 ([#18](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/18) / PR [#43](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/43), `docs/evidence/sprint1/*.png`).
**Execution environment:** 2026-11-10 (Asia/Bangkok), local Windows, Node **v24.14.0**, PostgreSQL **17.2** (`btree_gist` **1.7**), Prisma Client **7.10.1**, Vitest **4.1.12**, Microsoft Edge Playwright **1.64.1**.

### Observed local verification outcomes

| Command | Actual result | Status |
|---|---|---|
| `npm test` | 5 Vitest unit files, **33 passed / 0 failed** (29 `@nuttiew/api` + 4 `@nuttiew/web` `customer-availability-calendar.test.ts`) | **PASS** |
| `npm run typecheck` | `@nuttiew/api` (`tsc --noEmit`) and `@nuttiew/web` (`tsc -b`) exit 0 | **PASS** |
| `npm run build` | `@nuttiew/api` (`tsc`) and `@nuttiew/web` (`tsc -b && vite build`) exit 0 | **PASS** |
| `npm run test:db` | 14 PostgreSQL integration files sequentially against local PG 17.2, **107 passed / 0 failed** (Auth 30, Slot/Race A/Restart 13, BDF 26, Customer Availability 9, Exclusive Booking 14, Retrieval 15) | **PASS** |
| `npx --workspace=@nuttiew/api vitest run test/availability.db.test.ts` | Isolated run, **9 passed / 0 failed** (`AVA-01..10, 14..18` including `AVA14_BENCHMARK` + `AVA14_BENCHMARK_500`) | **PASS** |
| `npm run test:e2e -- --reporter=line` | All 12 Microsoft Edge Playwright specs, **68 passed / 0 failed** (`auth.a11y` 2, `auth.matrix` 2, `auth` 7, `auth.stale` 4, `availability.calendar` 4, `availability` 7, `booking` 3, `retrieval` 6, `slots` 7, `sprint1.journey` 1, `tutor.dashboard` 25); `docs/evidence/sprint1/*.png` restored with `git checkout -- docs/evidence/sprint1/` immediately after E2E run | **PASS** |
| `git diff --check` | Exit 0; zero trailing-whitespace or conflict markers | **PASS** |
| GitHub Actions CI (`Unit / types / build`, `PostgreSQL 18`, `Microsoft Edge E2E`) | Pending live PR trigger after branch push; check exact-head run on PR checks before review sign-off | **PENDING (Hosted CI)** |
| Manual human WCAG 2.2 AA & screen-reader audit | Not executed in automated suite | **NOT RUN** |

### Phase 1 vs Phase 2 profiling evidence (`AVA-14` with `500+` seeded PostgreSQL rows)

Added a `520`-Slot real PostgreSQL benchmark (`generate_series(0, 519)` across two active Tutors within `T_view` + 2..28 days) to `apps/api/test/availability.db.test.ts` (`AVA14_BENCHMARK_500`):

- **Isolated single-file run:** 5 warm-up + 30 measured sequential `GET /api/v1/customer/availability` calls returning **`520` rows (`90,591` UTF-8 bytes)**: **`p50 = 9.45 ms`**, **`p95 = 10.75 ms`**, **`max = 12.71 ms`** (`AVA14_BENCHMARK` baseline: 40 samples, `p50 = 6.12 ms`, `p95 = 6.90 ms`, `max = 7.38 ms`).
- **Full concurrent 14-file `npm run test:db` run:** 30 measured calls returning `520` rows (`90,591` bytes): **`p50 = 30.05 ms`**, **`p95 = 41.66 ms`**, **`max = 48.14 ms`** (`AVA14_BENCHMARK` baseline: `p50 = 19.16 ms`, `p95 = 31.80 ms`, `max = 34.60 ms`).
- **Engineering conclusion:** Even at 520 live offers against PostgreSQL with the non-owner runtime role, `p95 <= 41.66 ms` is `< 2.1%` of the `2,000 ms` non-blocking reference. Per the Settled Contract Boundary in [#44](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/44), **Phase 1 client-side calendar indexing remains sufficient**, and no Phase 2 query/pagination API amendment (`?from`/`?to`/`?page`) is warranted.

### BEFORE vs AFTER visual and responsive layout evidence (`UX-CAL-09`)

- **BEFORE (`feature/15` baseline screenshots `customer-availability-320/375/768/1280.png`):** Rendered `dateGroups.map(...group.items.map(...))` simultaneously for all eligible dates, producing multi-screen vertical scrolling across repeated identical times (`08:00`, `09:00`, ...) when populated with hundreds of offers.
- **AFTER (`UX-CAL-08/09` genuine PostgreSQL captures `after-calendar-dense-500plus-1280.png`, `after-calendar-320/375/768/800/801/1280/selected-1280.png`):**
  - Renders Step 1 (`1. เลือกวันที่`) 7-column Mon–Sun monthly calendar + Step 2 (`2. เลือกช่วงเวลา`) collapsed exact `(startsAt, endsAt)` time groups (`<= 6` visible initially + `"ดูเวลาเพิ่มเติม"`) + non-sticky `position: static` Step 3 (`#selected-offer-summary`) inline directly below the Step 2 day card.
  - Uses CSS Container Queries on `.availability-workspace-container` (`@container (min-width: 680px)`) and `.availability-day-pane` (`@container (max-width: 420px)`):
    - **`768px`, `800px` (sidebar collapsed) and `1280px` (sidebar open):** Balanced 2-column grid (`minmax(356px, 40%) minmax(0, 1fr)`); day pane container stacks individual offer rows cleanly without time wrapping at `768/800px`.
    - **`801px` (narrow sidebar-open transition), `375px`, and `320px`:** Single-column vertical reflow (`Calendar -> Day Time Groups -> Non-sticky Summary`); `availability-hero` wraps cleanly at `801px` (`box.x + box.width <= width - 8`), and `@media (max-width: 620px)` resets `.availability-hero-copy { flex: 0 0 auto; width: 100% }` so no artificial vertical flex-basis gap appears above `"โหลดข้อมูลล่าสุด"`.
  - Measured `documentElement.scrollWidth <= window.innerWidth` (`overflow = false`) at **`320, 375, 640 (200% zoom), 768, 800, 801, 1280` CSS px**; all controls and `>= 375px` calendar day tiles measure `>= 44×44 CSS px`, while `320px` day tiles measure `>= 36×44 CSS px` cleanly exceeding `WCAG 2.2 AA SC 2.5.8` (`24×24px`).

### `UX-CAL-01..10` STS verification matrix

| STS ID | Trace | Verification method | Observed result | Status |
|---|---|---|---|---|
| **UX-CAL-01** | `FR-S1-08`, `AC-S1-15`, `OD-AV-03` | Unit (`customer-availability-calendar.test.ts`) + real 522-row PostgreSQL Edge E2E (`availability.calendar.spec.ts`) | Renders monthly grid opened to earliest month/day; mounts `0` offer `<li data-testid="availability-offer">` rows initially; Step 2 shows `<= 6` collapsed time groups + `"ดูเวลาเพิ่มเติม (อีก 6 ช่วงเวลา)"`; zero period filter chips; expanding reveals all 12 groups without extra HTTP calls/query params | **PASS** |
| **UX-CAL-02** | `FR-S1-08/09`, `AC-S1-15/18`, `OD-002` | Unit (`daysInMonth`, `shiftMonthKey`, `buildAvailabilityCalendarIndex`) + controlled DTO `T_view` Edge E2E | Opens earliest eligible month (`พฤศจิกายน 2026`), navigates `Nov -> Dec (empty) -> Jan` (`มกราคม 2027`) within `OD-002` 60-day horizon without browser clock; Dec shows empty-month notice distinct from global empty; badge counts total offers (`3 ช่วงเวลา` across 2 Tutors, not `2`); verifies `2028-02-29` leap year | **PASS** |
| **UX-CAL-03** | `FR-S1-08`, `AC-S1-15`, `OD-AV-02/03`, `BR-S1-06` | Unit (`groupDayOffersByExactInterval`) + E2E (`UX-CAL-01/03`, `UX-CAL-02/03/07`) | Keys strictly on `${startsAt}|${endsAt}` (keeps `10:15–11:15` vs `10:15–11:45` separate, computes `60` vs `90 นาที`); preserves exact server order (`startsAt ASC, tutorRef ASC, slotId ASC`); exposes opaque `tutorRef` + distinct `slotId`s only | **PASS** |
| **UX-CAL-04** | `FR-S1-10/18`, `AC-S1-17`, `BR-S1-21` | E2E (`UX-CAL-04/06` with isolated `customer2Email` + `dedicatedBookSlotId`) | Month/day/time clicks never issue `POST` and retain `#selected-offer-summary` inline across day switches; non-unknown vanished selection on refresh clears selection and sets `staleNotice`; `unknownOutcome` stays locked across day changes and empty `data: []` until retry reconciles `201` | **PASS** |
| **UX-CAL-05** | `FR-S1-10..18`, `BOOK-01..33`, `RET-03/06` | Real PostgreSQL Edge E2E (`booking.spec.ts` 3/3, `retrieval.spec.ts` 6/6, `sprint1.journey.spec.ts` 1/1) via shared `availability-calendar-helper.ts` | Confirms `201 Created`, `200` replay, `409 SLOT_UNAVAILABLE`/`CUSTOMER_OVERLAP`, `422 BOOKING_NOT_ELIGIBLE`, `503 BOOKING_OUTCOME_UNKNOWN` recovery, `การจองของฉัน` retrieval/modal, and cross-Customer `404` isolation without weakening assertions | **PASS** |
| **UX-CAL-06** | `FR-S1-18`, `BR-S1-17/20`, `NFR-S1-01/08` | E2E (`UX-CAL-04/06` + `availability.spec.ts` `AVA-06/07/09/10/12` 7/7) | Fail-closed throughout: day empty (`calendar-day-empty`) and month empty (`calendar-month-empty`) remain distinct from global `data: []`; initial/retry `503` and malformed 200 DTO hide calendar grid completely; session mismatch, `401`/`403`, and logout uncertainty clear calendar state cleanly | **PASS** |
| **UX-CAL-07** | `AC-S1-18`, `BR-S1-12`, `Q29` | Unit (`16:30Z` vs `17:00Z/17:30Z`) + `UTC` and `America/Los_Angeles` Edge contexts (`UX-CAL-02/03/07` & `AVA-04`) | Calendar day bucket, header, `HH:mm–HH:mm น.` interval, and `สิ้นสุดในวันถัดไป` badge remain invariant across `Asia/Bangkok`, `UTC`, and `America/Los_Angeles` browser timezones | **PASS** |
| **UX-CAL-08** | `NFR-S1-09`, `VAL-033`, `OD-AV-08` | Automated Edge E2E + CSS telemetry (`UX-CAL-08/09`, `AVA-13/19`) | Keyboard `Tab`/`Enter` day activation, `3px solid rgb(170, 69, 25)` offset `3px` outline, concise `aria-live="polite"` (`^เลือกวันที่ .+ พบ \d+ ช่วงเวลา$`), computed sRGB contrast (`>= 4.5:1` text / `>= 3:1` UI), `@media (prefers-reduced-motion: reduce)` (`<= 0.001s`), `200%` zoom (`640×450`, `overflow = false`). **Manual human WCAG 2.2 AA audit remains NOT RUN.** | **PARTIAL (Automated browser checks PASS; manual human WCAG audit NOT RUN)** |
| **UX-CAL-09** | `NFR-S1-09`, `OD-AV-08`, `AVA-*`, `BOOK-*`, `RET-*` | Real PostgreSQL Edge E2E captures (`320/375/768/800/801/1280px`) + full 68-test Edge suite | Zero horizontal overflow, verified 1-col / 2-col container geometry, `position: static` `#selected-offer-summary` strictly below Step 2 card, measured control target boxes & right-edge bounds, all 12 Playwright specs (**68/68**) passing | **PASS** |
| **UX-CAL-10** | `NFR-S1-07/10/12`, `OD-AV-07` | Full local suite (`33/33` unit, `typecheck`, `build`, `107/107` PG 17 DB, `68/68` Edge E2E, `AVA14_BENCHMARK_500`) + hosted GitHub Actions CI pending PR HEAD | All local automated checks PASS and documented here; **hosted GitHub Actions CI (`PostgreSQL 18` + `Ubuntu 24.04` + `Edge`) stays PENDING until PR HEAD run finishes.** | **LOCAL PASS / HOSTED CI PENDING** |

### Open gates and remaining actions

- **Manual human WCAG 2.2 AA & screen-reader inspection:** **NOT RUN.** Automated Edge measurements never substitute for manual human sign-off.
- **`OD-AV-02` positive `tutorDisplayName` path:** Remains **BLOCKED** pending Tutor consent, publication sign-off, and forward-only migration; opaque `tutorRef` is strictly enforced.
- **Peer review & integration:** Open PR from `feature/44-customer-calendar-ux` to `sprint1` linking `#44`, await hosted CI PASS on exact PR HEAD, and request independent human review from `@Tanaboonnnnn`.
