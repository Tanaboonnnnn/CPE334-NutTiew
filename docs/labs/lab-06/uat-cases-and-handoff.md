# Lab 6 / #105 — NutTiew Sprint 1 Executable UAT Cases & Safe Handoff

**Status:** READY FOR TEAMMATE REVIEW (`@Tanaboonnnnn`) — authored on `docs/105-uat-cases-handoff`; partner receipt and execution are pending.
**Issue:** [#105 (`[Lab 6][L6-02]`)](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/105) | **Baseline:** [uat-baseline.md](uat-baseline.md) (`#104`)
**Scope:** Delivered Sprint 1 (`F-S1-01`..`F-S1-05`, `AC-S1-01`..`AC-S1-35`) only. **Out of scope:** Sprint 2/3 cancellation, rescheduling, Tutor cancellation, Slot withdrawal, notifications, and summary/reporting.

---

## 1. Safe Handoff Package (Product Team -> UAT Team)

### 1.1 Pinned Release Under Test

| Item | Value |
| --- | --- |
| **Product / Theme** | NutTiew — Tutoring Appointment System (Theme 1: Appointment & Scheduling) |
| **Product Team** | `@Tanaboonnnnn` (Tanaboon), `@Chxtamos` (Chxtamos) |
| **Repository** | `https://github.com/Tanaboonnnnn/CPE334-NutTiew` |
| **Public Application URL** | `https://nuttiew-nxe2keefba-as.a.run.app/` |
| **Pinned Release Commit (`origin/main`)** | `42bb76247b257a4d9eff402f2e6b60a2ba44eda4` (PR `#103`; no Git release tag) |
| **Last CD-Confirmed Cloud Run Revision** | `nuttiew-00010-gug` (`asia-southeast1`, CD run `#44784128286`, `100%` traffic) |
| **Runtime Image Digest** | `sha256:4eea6f2d543db1ffa7c0a46bb42625dd4420e0a596c92628f64fdac2668b537b` |

> **Pre-session check:** Immediately before the UAT session begins, the Product Team must confirm the live Cloud Run serving revision and `100%` traffic split match the declared release above, and freeze unannounced deployments during testing.

### 1.2 Role-Labelled Synthetic Accounts (No Secrets in Git/PDF)

Passwords and private login details are delivered **only via the agreed private team channel**, never in GitHub Issues/PRs, commits, screenshots, or the Lab 6 PDF.

| Account Label | Role | Purpose in UAT | Provisioning / Status |
| --- | --- | --- | --- |
| `Tutor A (Primary)` | `Tutor` | Create offered Slots, view own schedule & pseudonymous bookings | Existing synthetic account (`tutor.demo@example.test`, suffix `#1cb1d623`); verify login before handoff |
| `Tutor B (Secondary)` | `Tutor` | Cross-tutor schedule isolation (`UAT-NT-04`) | Distinct synthetic Tutor account; confirm active in private handoff |
| `Customer A (Primary)` | `Customer` | Browse availability, book Slots, view own private Bookings | Existing synthetic account (`customer.demo@example.test`, suffix `#2a4a7fc5`); verify login before handoff |
| `Customer B (Secondary)` | `Customer` | Cross-customer ownership & Slot exclusivity (`UAT-NT-04`) | Distinct synthetic Customer account; confirm active in private handoff |

### 1.3 Data Setup, Non-Destructive Policy & Cleanup

1. **Persistent Production DB:** The deployed Cloud Run app writes to Cloud SQL PostgreSQL (`nuttiew-pg`). Sprint 1 has **no delete, cancel, or reset UI**.
2. **Use Unique Future Bangkok Dates:** All test Slots created during UAT **must** use unique future `Asia/Bangkok` dates/times (recommended: `>= 14 days` ahead, e.g., `2026-12-20` or `2026-12-21`, avoiding `2026-12-09` used in Lab 5 C-04) so they do not collide with existing fixtures or the 60-minute booking cutoff.
3. **Preexisting vs. Setup-Created Data:**
   - **Preexisting:** Role-labelled synthetic accounts (`Tutor A/B`, `Customer A/B`) and earlier Lab 5 demo records.
   - **Setup-Created during UAT:** `Slot_1` and `Booking_1` (created in `UAT-NT-01`), `Slot_2` (created in `UAT-NT-02`). Record every created `Slot ID` and `Booking ID` in a private session ledger.
4. **Cleanup / Reset:** After each case, click **ออกจากระบบ** (`Sign Out`) so the next role starts with a clean session. Do **not** run destructive SQL `TRUNCATE`/`DELETE` or re-seed production tables.
5. **Case Sequencing:**
   - `UAT-NT-01` creates `Slot_1` and `Booking_1`.
   - `UAT-NT-02` and `UAT-NT-03` are independent of `UAT-NT-01` (use a distinct future date `Slot_2`).
   - `UAT-NT-04` and `UAT-NT-05` depend on `Slot_1` and `Booking_1` created in `UAT-NT-01` (or equivalent newly created fixtures if run standalone).
   - `UAT-NT-06` can verify `Booking_1` (or any existing Bangkok Slot) under a non-Bangkok browser timezone.

---

## 2. Executable Sprint 1 UAT Cases

### UAT-NT-01 — End-to-End Tutor Offer, Customer Discovery & Exclusive Booking

| Field | Detail |
| --- | --- |
| **Category** | Normal Domain Journey (Lab 6 §3.1) |
| **Mapped Requirements & ACs** | `F-S1-01` (`AC-S1-01`, `AC-S1-02`), `F-S1-02` (`AC-S1-08`), `F-S1-03` (`AC-S1-15`), `F-S1-04` (`AC-S1-19`), `F-S1-05` (`AC-S1-30`, `AC-S1-32`) |
| **Purpose** | Verify the core Sprint 1 vertical slice: Tutor signs in and publishes a 60-minute future Slot; Customer discovers and books it; both roles observe consistent persisted state without exposing Customer PII to the Tutor. |
| **Roles Required** | `Tutor A (Primary)`, `Customer A (Primary)` |
| **Preconditions** | Browser timezone set to `Asia/Bangkok`. No existing Slot for `Tutor A` on the chosen test date/hour. |
| **Synthetic Inputs** | `Test Date`: unique future date (e.g., `2026-12-20`); `Start Time`: `14:00` (auto end time `15:00`). |

**Numbered User Actions:**
1. Open `https://nuttiew-nxe2keefba-as.a.run.app/` and confirm the sign-in form (`เข้าสู่ระบบ`) is displayed.
2. Enter `Tutor A (Primary)` email (`อีเมล`) and private password (`รหัสผ่าน`), then click **เข้าสู่ระบบ**.
3. On the Tutor workspace (`ตารางเวลาติวของฉัน`), enter `Test Date` in **วันที่** and `14:00` in **เวลาเริ่ม**. Verify the end-time preview shows `15:00`.
4. Click **เพิ่มเวลาติว** (`Create Slot`), note the created `Slot_1` ID/timestamp, and click **ออกจากระบบ** (`Sign Out`).
5. Sign in as `Customer A (Primary)` on `/`.
6. Open the Customer availability view, locate `Test Date` and `14:00–15:00` offered by `Tutor A`, select it, and confirm the booking. Record the returned `Booking_1` ID.
7. Open **My bookings** (Customer private booking list) and open the detail view for `Booking_1`. Click **ออกจากระบบ**.
8. Sign back in as `Tutor A (Primary)` and inspect `ตารางเวลาติวของฉัน` for `Slot_1`.

**Specific Expected Results:**
- **Step 2:** `เข้าสู่ระบบแล้ว` is shown; Tutor workspace loads with `Tutor A` identity/role.
- **Step 4:** Success confirmation (`บันทึกเวลาติวสำเร็จ`) appears; `Slot_1` (`14:00–15:00`) appears in `Slot ทั้งหมดของฉัน` as available/unoccupied.
- **Step 6:** `Slot_1` is selectable and books successfully; status becomes `Booked` with a persisted `Booking_1` ID.
- **Step 7:** `Booking_1` appears in Customer A's private booking list and detail view with `Tutor A`, `Test Date 14:00–15:00` (Bangkok time), and `Booked` status.
- **Step 8:** `Tutor A` sees `Slot_1` marked `Booked / Occupied` with `Booking_1` ID and a **pseudonymous** customer reference (e.g., `CUST-...`), **never** `Customer A`'s email or raw private details.

---

### UAT-NT-02 — Tutor Slot Overlap Rejection, Adjacent Slot & 60-Minute Booking Cutoff

| Field | Detail |
| --- | --- |
| **Category** | Business-Rule & Boundary Case (Lab 6 §3.1) |
| **Mapped Requirements & ACs** | `F-S1-02` (`AC-S1-09`, `AC-S1-10`, `AC-S1-12`), `F-S1-03` (`AC-S1-16`), `F-S1-04` (`AC-S1-21`) |
| **Purpose** | Verify backend-enforced domain boundaries: same-Tutor overlapping Slot creation is rejected, adjacent non-overlapping Slots are allowed, past-date Slot creation is rejected, and a Slot inside the 60-minute cutoff (`Q05`) cannot be booked. |
| **Roles Required** | `Tutor A (Primary)`, `Customer A (Primary)` |
| **Preconditions** | Independent of `UAT-NT-01`. Choose a separate unused future date (e.g., `2026-12-21`). |
| **Synthetic Inputs** | `Boundary Date`: `2026-12-21`; `Base Slot`: `13:00` (`13:00–14:00`); `Overlap Attempt`: `13:30` (`13:30–14:30`); `Adjacent Slot`: `14:00` (`14:00–15:00`); `Past Date`: yesterday in `Asia/Bangkok` at `10:00`. |

**Numbered User Actions:**
1. Sign in as `Tutor A (Primary)` and create `Slot_2` on `Boundary Date` at `13:00` (`13:00–14:00`).
2. Attempt to create a second Slot for `Tutor A` on `Boundary Date` at `13:30` (`13:30–14:30`).
3. Create an adjacent Slot for `Tutor A` on `Boundary Date` at `14:00` (`14:00–15:00`).
4. Attempt to create a Slot on `Past Date` (yesterday Bangkok time) at `10:00`.
5. *(Optional cutoff check if a Slot within `< 60 minutes` of current Bangkok time is created by Tutor)*: Sign in as `Customer A` and check availability for any Slot starting `< 60 minutes` from now (or attempt booking it if visible).
6. Click **ออกจากระบบ**.

**Specific Expected Results:**
- **Step 1:** `13:00–14:00` (`Slot_2`) is created and persisted.
- **Step 2:** Overlapping `13:30–14:30` creation is **rejected** with a visible overlap error message; `Slot_2` remains unchanged and total slot count does not increase.
- **Step 3:** Adjacent `14:00–15:00` is **accepted** and persisted alongside `13:00–14:00`.
- **Step 4:** Past-date Slot creation is **rejected** with a validation error; no invalid Slot is persisted.
- **Step 5:** Any Slot inside the 60-minute cutoff (`Q05`) is **not selectable as bookable** (and if submitted via stale UI/API, backend rejects with no Booking created).

---

### UAT-NT-03 — Unauthenticated Access, Invalid Login & Cross-Role Forbidden Operations

| Field | Detail |
| --- | --- |
| **Category** | Forbidden Role / Access Control Case (Lab 6 §3.1) |
| **Mapped Requirements & ACs** | `F-S1-01` (`AC-S1-03`, `AC-S1-04`, `AC-S1-05`, `AC-S1-06`), `F-S1-04` (`AC-S1-28`) |
| **Purpose** | Verify invalid credentials are rejected, unauthenticated callers cannot access protected APIs/data, and authenticated `Customer` / `Tutor` roles are blocked by the backend from cross-role endpoints. |
| **Roles Required** | Unauthenticated browser, `Customer A (Primary)`, `Tutor A (Primary)` |
| **Preconditions** | Start signed out (no active session cookie). |
| **Synthetic Inputs** | `Invalid Password`: `WrongPass#0000`; `Tutor Endpoint`: `GET /api/v1/tutor/slots` and `POST /api/v1/tutor/slots`; `Customer Endpoint`: `GET /api/v1/customer/bookings`. |

**Numbered User Actions:**
1. While signed out, attempt to fetch `GET /api/v1/auth/me`, `GET /api/v1/tutor/slots`, and `GET /api/v1/customer/bookings` (via browser console `fetch` or `curl` without session cookie).
2. On `/`, submit `Customer A` email with `Invalid Password` (`WrongPass#0000`).
3. Sign in with valid `Customer A (Primary)` credentials.
4. While signed in as `Customer A`, attempt a cross-role request to `GET /api/v1/tutor/slots` and `POST /api/v1/tutor/slots` (e.g., via browser DevTools `fetch` using the active session).
5. Click **ออกจากระบบ** (`Sign Out`), then retry `GET /api/v1/customer/bookings` using the old browser session/tab.
6. Sign in as `Tutor A (Primary)` and attempt `GET /api/v1/customer/bookings`. Click **ออกจากระบบ**.

**Specific Expected Results:**
- **Step 1:** All three unauthenticated requests return HTTP `401` (`Unauthorized`); zero private records disclosed.
- **Step 2:** Login is denied (`ไม่สามารถเข้าสู่ระบบได้ กรุณาตรวจสอบข้อมูล`); no session cookie or protected workspace is granted.
- **Step 4:** Backend returns HTTP `403` (`Forbidden`); Tutor schedule is unchanged.
- **Step 5:** Post-logout request returns HTTP `401`; protected Customer data is not accessible.
- **Step 6:** Backend returns HTTP `403` (`Forbidden`); Customer bookings are not disclosed to `Tutor A`.

---

### UAT-NT-04 — Cross-Owner Privacy Isolation & Occupied Slot Exclusivity

| Field | Detail |
| --- | --- |
| **Category** | Forbidden Ownership & Exclusivity Case (Lab 6 §3.1) |
| **Mapped Requirements & ACs** | `F-S1-01` (`AC-S1-07`), `F-S1-03` (`AC-S1-16`, `AC-S1-17`), `F-S1-04` (`AC-S1-22`), `F-S1-05` (`AC-S1-31`, `AC-S1-33`) |
| **Purpose** | Verify one Customer cannot book an already-occupied Slot or read another Customer's Booking detail, and one Tutor cannot read or mutate another Tutor's schedule. |
| **Roles Required** | `Customer B (Secondary)`, `Tutor B (Secondary)` |
| **Preconditions** | `Slot_1` and `Booking_1` exist and belong to `Tutor A` and `Customer A` respectively (from `UAT-NT-01`). |
| **Synthetic Inputs** | `Target Booking ID`: `Booking_1` ID; `Target Slot ID`: `Slot_1` ID; `Target Tutor ID`: `Tutor A` ID (if known). |

**Numbered User Actions:**
1. Sign in as `Customer B (Secondary)` on `/`.
2. Open Customer availability and inspect `Test Date` `14:00–15:00` (`Slot_1`).
3. Attempt to request `Booking_1` detail via `GET /api/v1/customer/bookings/<Booking_1_ID>` and attempt to book `Slot_1` directly via `POST /api/v1/customer/bookings` with `{"slotId":"<Slot_1_ID>"}`.
4. Click **ออกจากระบบ**.
5. Sign in as `Tutor B (Secondary)` and inspect `ตารางเวลาติวของฉัน` (and optionally attempt to query `Tutor A`'s schedule/slots).
6. Click **ออกจากระบบ**.

**Specific Expected Results:**
- **Step 2:** `Slot_1` is **not selectable as bookable** for `Customer B` and **never** reveals `Customer A`'s identity or email.
- **Step 3:** Direct `GET` for `Customer A`'s `Booking_1` returns `403`/`404` with zero private payload disclosed; direct `POST` to book occupied `Slot_1` is rejected (`409` Conflict / domain error), and `Customer A`'s `Booking_1` remains intact.
- **Step 5:** `Tutor B` sees only `Tutor B`'s own schedule (`Slot_1` and `Booking_1` of `Tutor A` are absent and inaccessible).

---

### UAT-NT-05 — Booking State & Persistence Across Refresh, Re-Login, and Redeploy

| Field | Detail |
| --- | --- |
| **Category** | State / History / Persistence Case (Lab 6 §3.1) |
| **Mapped Requirements & ACs** | `F-S1-02` (`AC-S1-08`), `F-S1-05` (`AC-S1-30`, `AC-S1-32`, `AC-S1-34`) |
| **Purpose** | Verify committed Slot and Booking records survive browser hard-reload, sign-out/re-login, and (when coordinated with Product Team) Cloud Run service restart/redeploy, and that past booked appointments retain `Booked` status without an unapproved `Completed` assertion. |
| **Roles Required** | `Customer A (Primary)`, `Tutor A (Primary)` |
| **Preconditions** | `Booking_1` (`Slot_1`) was committed in `UAT-NT-01` (or reuse a known persisted `Booking ID` from private ledger). |
| **Synthetic Inputs** | `Persisted Booking ID`: `Booking_1` ID; `Persisted Slot ID`: `Slot_1` ID. |

**Numbered User Actions:**
1. Sign in as `Customer A (Primary)`, open `My bookings`, and verify `Booking_1` is listed.
2. Perform a hard browser refresh (`Ctrl+Shift+R` / reload `/`).
3. Click **ออกจากระบบ**, close or open a new incognito browser window, sign back in as `Customer A (Primary)`, and reopen `Booking_1` detail.
4. *(If an earlier booked appointment whose end time has passed exists in the synthetic account)*: Inspect that past booking in `My bookings`.
5. *(Coordinated redeploy/restart check, if scheduled)*: After Product Team confirms a Cloud Run revision restart/redeploy, repeat Step 3 for `Customer A` and `Tutor A`.

**Specific Expected Results:**
- **Steps 2 & 3:** `Booking_1` remains visible with identical `Booking ID`, `Tutor A`, `Test Date 14:00–15:00` (Bangkok time), and `Booked` status.
- **Step 4:** Past appointment remains `Booked` (may indicate `Past` time state) and does **not** fabricate an attendance/completed status (`AC-S1-34`).
- **Step 5:** Record survives Cloud Run revision restart/redeploy in Cloud SQL `nuttiew-pg` with no data loss.

---

### UAT-NT-06 — Asia/Bangkok Timezone Invariance Across Non-Bangkok Browser Locale

| Field | Detail |
| --- | --- |
| **Category** | Boundary / Internationalization & Timezone Case (Lab 6 §3.1) |
| **Mapped Requirements & ACs** | `F-S1-02` (`AC-S1-14`), `F-S1-03` (`AC-S1-18`) |
| **Purpose** | Verify that Tutor and Customer views render the exact same `Asia/Bangkok` appointment date and hour (`14:00–15:00`) even when the tester's browser/device timezone is set to a non-Bangkok timezone (e.g., `UTC` or `America/New_York`). |
| **Roles Required** | `Tutor A (Primary)`, `Customer A (Primary)` |
| **Preconditions** | `Slot_1` (`Test Date 14:00–15:00` Asia/Bangkok) exists from `UAT-NT-01` (or use `Slot_2` `13:00–14:00` from `UAT-NT-02`). |
| **Synthetic Inputs** | Browser DevTools Sensors / OS timezone override: `UTC` (UTC+0) or `America/New_York` (UTC-5). |

**Numbered User Actions:**
1. Set the browser timezone override to `UTC` (e.g., Chrome DevTools -> Sensors -> Location/Timezone -> `UTC`, or launch browser with `TZ=UTC`).
2. Sign in as `Tutor A (Primary)` and inspect `Slot_1` (`Test Date 14:00–15:00`) or `Slot_2` (`Boundary Date 13:00–14:00`).
3. Click **ออกจากระบบ**, keep the browser timezone at `UTC`, and sign in as `Customer A (Primary)` to view `Booking_1` (or available `Slot_2`).
4. Click **ออกจากระบบ** and restore normal browser timezone.

**Specific Expected Results:**
- **Steps 2 & 3:** Both Tutor and Customer UI display the exact `Asia/Bangkok` date and hour (`14:00–15:00` for `Slot_1` / `13:00–14:00` for `Slot_2`), with **zero** `-07:00` shift to `07:00–08:00` UTC.

---

## 3. Sprint 1 AC Traceability & Automated-Only Boundary

| Sprint 1 Feature | `AC-S1-*` Covered by UAT Cases | Covered By Automated CI/DB Tests (Not Manual Browser UAT) |
| --- | --- | --- |
| `F-S1-01` Auth & Role/Owner | `AC-S1-01..07` -> `UAT-NT-01`, `UAT-NT-03`, `UAT-NT-04` | Also covered by `e2e/auth*.spec.ts` & API integration tests |
| `F-S1-02` Tutor Slots | `AC-S1-08..12`, `AC-S1-14` -> `UAT-NT-01`, `UAT-NT-02`, `UAT-NT-06` | `AC-S1-13` (concurrent overlapping Slot race `RACE-S1-A`) verified by PostgreSQL 18 CI test |
| `F-S1-03` Availability | `AC-S1-15..18` -> `UAT-NT-01`, `UAT-NT-02`, `UAT-NT-04`, `UAT-NT-06` | Also covered by `e2e/availability*.spec.ts` |
| `F-S1-04` Booking | `AC-S1-19`, `AC-S1-21`, `AC-S1-22`, `AC-S1-28` -> `UAT-NT-01..04` | `AC-S1-20` (exact `14:00:00` cutoff), `AC-S1-23..27`, `AC-S1-29`, `AC-S1-35` (concurrency/serializable races & sub-second cutoff) verified by PostgreSQL/API integration suite |
| `F-S1-05` Protected Retrieval | `AC-S1-30..34` -> `UAT-NT-01`, `UAT-NT-04`, `UAT-NT-05` | Also covered by `e2e/retrieval.spec.ts` |

---

## 4. Partner Execution Template & Review Sign-Off (To Be Completed During UAT)

### 4.1 UAT Execution Record Table (For Partner UAT Team)

| Case ID | Tester Name & Team | Date / Time (ICT) | Tested Release Commit / Revision | Inputs Used (Non-Secret) | Actual Result (Observed) | Outcome (`PASS`/`FAIL`/`BLOCKED`) | Evidence ID |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `UAT-NT-01` | `PENDING` | `PENDING` | `PENDING` | `PENDING` | `PENDING` | `PENDING` | `PENDING` |
| `UAT-NT-02` | `PENDING` | `PENDING` | `PENDING` | `PENDING` | `PENDING` | `PENDING` | `PENDING` |
| `UAT-NT-03` | `PENDING` | `PENDING` | `PENDING` | `PENDING` | `PENDING` | `PENDING` | `PENDING` |
| `UAT-NT-04` | `PENDING` | `PENDING` | `PENDING` | `PENDING` | `PENDING` | `PENDING` | `PENDING` |
| `UAT-NT-05` | `PENDING` | `PENDING` | `PENDING` | `PENDING` | `PENDING` | `PENDING` | `PENDING` |
| `UAT-NT-06` | `PENDING` | `PENDING` | `PENDING` | `PENDING` | `PENDING` | `PENDING` | `PENDING` |

### 4.2 Internal Team Review & Partner Handoff Checklist

| Gate | Owner | Status |
| --- | --- | --- |
| Case traceability & standalone readability reviewed by teammate | `@Tanaboonnnnn` (PR review of `#105`) | **PENDING** |
| Private credentials for `Tutor A/B` & `Customer A/B` verified & sent privately | Product Team (`@Tanaboonnnnn`, `@Chxtamos`) | **PENDING** |
| Partner team confirms receipt and can execute without verbal explanation | Partner UAT Team (`PENDING`) | **PENDING** |
