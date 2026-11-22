# Lab 6 / #105 — NutTiew Sprint 1 Executable UAT Cases & Safe Handoff

**Status:** PR `#113` merged; all four UI sign-ins verified and six partner case observations recorded (22 Nov 2026 ICT). Triage disposition recorded in [defect-triage-register.md](defect-triage-register.md) (`#107`). See §4.2 and §4.3 for open handoff/serving-revision/decision gates.
**Issue:** [#105 (`[Lab 6][L6-02]`)](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/105) | **Baseline:** [uat-baseline.md](uat-baseline.md) (`#104`) | **Triage Register:** [defect-triage-register.md](defect-triage-register.md) (`#107`)
**Scope:** Delivered Sprint 1 (`F-S1-01`..`F-S1-05`, `AC-S1-01`..`AC-S1-35`) only. **Out of scope:** Sprint 2/3 cancellation, rescheduling, Tutor cancellation, Slot withdrawal, notifications, and summary/reporting.

---

## 1. Safe Handoff Package (Product Team -> UAT Team)

### 1.1 Pinned Release Under Test

| Item | Value |
| --- | --- |
| **Product / Theme** | NutTiew — Tutoring Appointment System (Theme 1: Appointment & Scheduling) |
| **Product Team** | `@Tanaboonnnnn`, `@Chxtamos` |
| **Partner UAT Team & Session** | **`TH-056_P2`** — first scheduled session **Mon 23 Nov 2026, 13:30 ICT (`Asia/Bangkok`)** |
| **Repository** | `https://github.com/Tanaboonnnnn/CPE334-NutTiew` |
| **Public Application URL** | `https://nuttiew-nxe2keefba-as.a.run.app/` |
| **Pinned Release Commit (`origin/main`)** | `42bb76247b257a4d9eff402f2e6b60a2ba44eda4` (PR `#103`; no Git release tag) |
| **Last CD-Confirmed Cloud Run Revision** | `nuttiew-00010-gug` (`asia-southeast1`, CD run `#44784128286`, `100%` traffic) |
| **Runtime Image Digest** | `sha256:4eea6f2d543db1ffa7c0a46bb42625dd4420e0a596c92628f64fdac2668b537b` |

> **Pre-session check:** Immediately before the **23 Nov 2026 13:30 ICT** UAT session, the Product Team must confirm the live Cloud Run serving revision and `100%` traffic split match the declared release above, and freeze unannounced deployments during testing.

### 1.2 Role-Labelled Synthetic Accounts (No Secrets in Git/PDF)

Passwords and private login details are delivered **only via the agreed private team channel**, never in GitHub Issues/PRs, commits, screenshots, or the Lab 6 PDF.

| Account Label | Role | Purpose in UAT | Provisioning / Verification Status (21–22 Nov 2026) |
| --- | --- | --- | --- |
| `Tutor A (Primary)` | `Tutor` | Create offered Slots, view own schedule & pseudonymous bookings | Existing synthetic account (`tutor.demo@example.test`; Tutor workspace suffix `#1cb1d623`, Availability full opaque `tutorRef` ending in `1cb1d623`, My Bookings `TUTOR-0a340de8`). **UI sign-in verified** on 22 Nov. |
| `Tutor B (Secondary)` | `Tutor` | Cross-tutor isolation & foreign schedule probe (`UAT-NT-04`) | Active in Cloud SQL `nuttiew-pg` per operator output on 21 Nov. **UI sign-in verified** on 22 Nov. |
| `Customer A (Primary)` | `Customer` | Browse availability, book Slots, view own private Bookings | Existing synthetic account (`customer.demo@example.test`, UI suffix `#2a4a7fc5`). **UI sign-in verified** on 22 Nov. |
| `Customer B (Secondary)` | `Customer` | Cross-customer ownership & occupied-Slot `409` test (`UAT-NT-04`) | Active in Cloud SQL `nuttiew-pg` per operator output on 21 Nov. **UI sign-in verified** on 22 Nov. |

### 1.3 Data Setup, Non-Destructive Policy & Cleanup

1. **Persistent Production DB:** The deployed Cloud Run app writes to Cloud SQL PostgreSQL (`nuttiew-pg`). Sprint 1 has **no delete, cancel, or reset UI**.
2. **Use Unique Future Bangkok Dates:** All test Slots created during UAT **must** use unique future `Asia/Bangkok` dates/times (recommended: `>= 14 days` ahead, e.g., `2026-12-20` or `2026-12-21`, avoiding `2026-12-09` used in Lab 5 C-04) so they do not collide with existing fixtures or the 60-minute booking cutoff.
3. **Preexisting vs. Setup-Created Data (Private Fixture Ledger):**
   - **Preexisting:** Role-labelled synthetic accounts (`Tutor A/B`, `Customer A/B`) and earlier Lab 5 demo records.
   - **Setup-Created during UAT:** Record every created `Slot_1` UUID (`UAT-NT-01`), `Booking_1` UUID (`UAT-NT-01`), `Slot_2` UUID (`UAT-NT-02` `13:00–14:00`), and adjacent `Slot_3` UUID (`UAT-NT-02` `14:00–15:00`) plus `Tutor A` UI suffix (`#1cb1d623`) in a **private fixture ledger** (do not store session cookies, CSRF tokens, or passwords).
   - **How to read a Slot UUID in the UI:** The Tutor calendar/agenda does not display the full Slot UUID as plain text. Inspect the slot element's `data-slot-id` attribute in browser DevTools Elements, or read `data.id` from the `POST /api/v1/tutor/slots` / `GET /api/v1/tutor/slots` JSON response in DevTools Network.
4. **Cleanup / Reset:** After each role finishes its steps, click **ออกจากระบบ** (`Sign Out`) before signing in as another role. Do **not** run destructive SQL `TRUNCATE`/`DELETE` or re-seed production tables.
5. **Case Sequencing:**
   - `UAT-NT-01` creates `Slot_1` and `Booking_1`.
   - `UAT-NT-02` and `UAT-NT-03` are independent of `UAT-NT-01` (use a distinct future date for `Slot_2` and `Slot_3`).
   - `UAT-NT-04` and `UAT-NT-05` depend on `Slot_1` and `Booking_1` created in `UAT-NT-01` (or equivalent newly created fixtures if run standalone).
   - `UAT-NT-06` verifies `Slot_1`/`Booking_1` (or `Slot_2`) under a non-Bangkok browser timezone.

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
2. Enter `Tutor A (Primary)` email (`อีเมล`) and private password (`รหัสผ่าน`), then click **เข้าสู่ระบบ**. Note `Tutor A`'s public UI suffix (`#1cb1d623`).
3. On the Tutor workspace (`ตารางเวลาติวของฉัน`), enter `Test Date` in **วันที่** and `14:00` in **เวลาเริ่ม**. Verify the end-time preview shows `15:00`.
4. Click **เพิ่มเวลาติว** (`Create Slot`). Capture `Slot_1` UUID from `data-slot-id` or the `POST /api/v1/tutor/slots` response (`data.id`) and record it in the private fixture ledger. Click **ออกจากระบบ** (`Sign Out`).
5. Sign in as `Customer A (Primary)` on `/`.
6. On the Customer availability tab, select `Test Date`, locate the `14:00–15:00` offer matching `Tutor A` (full opaque `tutorRef` ending in `1cb1d623`), select it, and confirm the booking. Record the returned `Booking_1` UUID.
7. Open **การจองของฉัน** (`My bookings`) and open the detail view for `Booking_1`. Click **ออกจากระบบ**.
8. Sign back in as `Tutor A (Primary)` and inspect `ตารางเวลาติวของฉัน` for `Slot_1`, then click **ออกจากระบบ**.

**Specific Expected Results:**
- **Step 2:** `เข้าสู่ระบบแล้ว` is shown; Tutor workspace loads with `Tutor A` identity/role (`#1cb1d623`).
- **Step 4:** Success confirmation (`บันทึกเวลาติวสำเร็จ`) appears; `Slot_1` (`14:00–15:00`) appears in `Slot ทั้งหมดของฉัน` as available/unoccupied.
- **Step 6:** `Slot_1` is selectable and books successfully; status becomes `Booked` with a persisted `Booking_1` UUID.
- **Step 7:** `Booking_1` appears in Customer A's private booking list and detail view with `Tutor A`'s `F-S1-05` opaque reference (`TUTOR-0a340de8`, derived as `"TUTOR-" + tutorId.slice(0, 8)`), `Test Date 14:00–15:00` (Bangkok time), and `Booked` status.
- **Step 8:** `Tutor A` sees `Slot_1` marked `Booked / Occupied` with `Booking_1` UUID and a **pseudonymous** customer reference (e.g., `CUST-...`), **never** `Customer A`'s email or raw private details.

---

### UAT-NT-02 — Tutor Slot Overlap Rejection, Adjacent Slot & Past-Date Boundary

| Field | Detail |
| --- | --- |
| **Category** | Business-Rule & Boundary Case (Lab 6 §3.1) |
| **Mapped Requirements & ACs** | `F-S1-02` (`AC-S1-09`, `AC-S1-10`, `AC-S1-12`) |
| **Purpose** | Verify backend-enforced Tutor slot boundaries: same-Tutor overlapping Slot creation is rejected, adjacent non-overlapping Slots are allowed, and past-date Slot creation is rejected. *(Note: exact 59:59 backend cutoff `AC-S1-21` is verified by automated test `BOOK-03` rather than manual browser timing.)* |
| **Roles Required** | `Tutor A (Primary)` |
| **Preconditions** | Independent of `UAT-NT-01`. Choose a separate unused future date (e.g., `2026-12-21`). |
| **Synthetic Inputs** | `Boundary Date`: `2026-12-21`; `Base Slot (Slot_2)`: `13:00` (`13:00–14:00`); `Overlap Attempt`: `13:30` (`13:30–14:30`); `Adjacent Slot (Slot_3)`: `14:00` (`14:00–15:00`); `Past Date`: yesterday in `Asia/Bangkok` at `10:00`. |

**Numbered User Actions:**
1. Sign in as `Tutor A (Primary)` and create `Slot_2` on `Boundary Date` at `13:00` (`13:00–14:00`). Record `Slot_2` UUID in the private fixture ledger.
2. Attempt to create a second Slot for `Tutor A` on `Boundary Date` at `13:30` (`13:30–14:30`).
3. Create an adjacent Slot (`Slot_3`) for `Tutor A` on `Boundary Date` at `14:00` (`14:00–15:00`). Record `Slot_3` UUID and `Boundary Date` in the private fixture ledger so future runs do not collide.
4. Attempt to create a Slot on `Past Date` (yesterday Bangkok time) at `10:00`.
5. Click **ออกจากระบบ** (`Sign Out`).

**Specific Expected Results:**
- **Step 1:** `13:00–14:00` (`Slot_2`) is created and persisted.
- **Step 2:** Overlapping `13:30–14:30` creation is **rejected** with a visible overlap error message; `Slot_2` remains unchanged and total slot count does not increase.
- **Step 3:** Adjacent `14:00–15:00` (`Slot_3`) is **accepted** and persisted alongside `13:00–14:00`.
- **Step 4:** Past-date Slot creation is **rejected** with a validation error; no invalid Slot is persisted.

---

### UAT-NT-03 — Unauthenticated Access, Invalid Login & Cross-Role Forbidden Operations

| Field | Detail |
| --- | --- |
| **Category** | Forbidden Role / Access Control Case (Lab 6 §3.1) |
| **Mapped Requirements & ACs** | `F-S1-01` (`AC-S1-03`, `AC-S1-04`, `AC-S1-05`, `AC-S1-06`) |
| **Purpose** | Verify invalid credentials are rejected, unauthenticated callers cannot access protected APIs/data, post-logout access is denied, and authenticated `Customer` / `Tutor` roles are blocked by the backend from cross-role endpoints. |
| **Roles Required** | Unauthenticated browser, `Customer A (Primary)`, `Tutor A (Primary)` |
| **Preconditions** | Start signed out (no active session cookie). |
| **Synthetic Inputs** | `Invalid Password`: `WrongPass#0000`; `Tutor Endpoints`: `GET /api/v1/tutor/slots`, `POST /api/v1/tutor/slots`; `Customer Endpoint`: `GET /api/v1/customer/bookings`. |

**Numbered User Actions:**
1. While signed out on `https://nuttiew-nxe2keefba-as.a.run.app/`, open DevTools Console and run same-origin `fetch` calls to `GET /api/v1/auth/me`, `GET /api/v1/tutor/slots`, and `GET /api/v1/customer/bookings`.
2. On `/`, submit `Customer A` email with `Invalid Password` (`WrongPass#0000`).
3. Sign in with valid `Customer A (Primary)` credentials.
4. While signed in as `Customer A`, run `fetch('/api/v1/tutor/slots')` and `fetch('/api/v1/tutor/slots', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ startsAt: '2026-12-25T10:00:00.000+07:00' }) })` in DevTools Console.
5. Click **ออกจากระบบ** (`Sign Out`), then retry `fetch('/api/v1/customer/bookings')` in DevTools Console.
6. Sign in as `Tutor A (Primary)`, run `fetch('/api/v1/customer/bookings')` in DevTools Console, then click **ออกจากระบบ**.

**Specific Expected Results:**
- **Step 1:** All three unauthenticated requests return HTTP `401` (`UNAUTHENTICATED`); zero private records disclosed.
- **Step 2:** Login is denied (`ไม่สามารถเข้าสู่ระบบได้ กรุณาตรวจสอบข้อมูล`); no session cookie or protected workspace is granted.
- **Step 4:** Both cross-role requests return HTTP `403` (`FORBIDDEN`); Tutor schedule is unchanged.
- **Step 5:** Post-logout request returns HTTP `401`; protected Customer data is not accessible.
- **Step 6:** Backend returns HTTP `403` (`FORBIDDEN`); Customer bookings are not disclosed to `Tutor A`.

---

### UAT-NT-04 — Cross-Owner Privacy Isolation & Occupied Slot Exclusivity

| Field | Detail |
| --- | --- |
| **Category** | Forbidden Ownership & Exclusivity Case (Lab 6 §3.1) |
| **Mapped Requirements & ACs** | `F-S1-01` (`AC-S1-07`), `F-S1-03` (`AC-S1-16`), `F-S1-04` (`AC-S1-22`), `F-S1-05` (`AC-S1-31`, `AC-S1-33`) |
| **Purpose** | Verify `Customer B` cannot see/book `Slot_1` (including via a direct authenticated `POST` with CSRF + session-binding headers, expecting `409 SLOT_UNAVAILABLE`) or read `Customer A`'s `Booking_1` (`404 BOOKING_NOT_FOUND`), and `Tutor B` cannot read `Tutor A`'s schedule by guessing a `tutorId` parameter. |
| **Roles Required** | `Customer B (Secondary)`, `Tutor B (Secondary)` |
| **Preconditions** | `Slot_1` and `Booking_1` exist and belong to `Tutor A` and `Customer A` respectively (from `UAT-NT-01`). |
| **Synthetic Inputs** | `Target Booking ID`: `Booking_1` UUID; `Target Slot ID`: `Slot_1` UUID; `Target Tutor ID`: `Tutor A` UUID (or synthetic UUID placeholder). |

**Numbered User Actions:**
1. Sign in as `Customer B (Secondary)` on `https://nuttiew-nxe2keefba-as.a.run.app/`.
2. Open Customer availability and inspect `Test Date` `14:00–15:00` (`Slot_1`).
3. Open DevTools Console on the same origin and probe foreign Booking detail:
   ```js
   await fetch('/api/v1/customer/bookings/<Booking_1_UUID>').then(async r => ({ status: r.status, body: await r.json() }))
   ```
4. Still signed in as `Customer B` on the same origin, send an authenticated, CSRF- and session-bound direct booking attempt for occupied `Slot_1` (without logging or saving the returned header/token in any artifact):
   ```js
   const me = await fetch('/api/v1/auth/me');
   const binding = me.headers.get('X-NutTiew-Session-Binding');
   const { csrfToken } = await (await fetch('/api/v1/auth/csrf')).json();
   const res = await fetch('/api/v1/customer/bookings', {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
       'X-NutTiew-Expected-Session-Binding': binding,
       'X-CSRF-Token': csrfToken,
     },
     body: JSON.stringify({ slotId: '<Slot_1_UUID>' }),
   });
   console.log(res.status, await res.json());
   ```
5. Click **ออกจากระบบ** (`Sign Out`).
6. Sign in as `Customer A (Primary)`, click **การจองของฉัน** (`My bookings`), and verify `Booking_1` still exists with the exact same `Booking_1` UUID, `Tutor A` (`TUTOR-0a340de8`), `Test Date 14:00–15:00` (Bangkok time), and `Booked` status (record actual post-rejection evidence). Click **ออกจากระบบ**.
7. Sign in as `Tutor B (Secondary)`, inspect `ตารางเวลาติวของฉัน`, and run a guessed foreign-tutor schedule probe in DevTools Console:
   ```js
   await fetch('/api/v1/tutor/slots?tutorId=<TutorA_UUID>').then(async r => ({ status: r.status, body: await r.json() }))
   ```
   Then click **ออกจากระบบ**.

**Specific Expected Results:**
- **Step 2:** `Slot_1` is **not selectable as bookable** for `Customer B` and **never** reveals `Customer A`'s identity or email.
- **Step 3:** Backend returns HTTP **`404`** with `error.code === 'BOOKING_NOT_FOUND'` and zero foreign Booking fields (`AC-S1-31`).
- **Step 4:** Because session, origin, `X-NutTiew-Expected-Session-Binding`, and `X-CSRF-Token` all pass, the request reaches the booking domain check and returns HTTP **`409`** with `error.code === 'SLOT_UNAVAILABLE'` (`AC-S1-22`).
- **Step 6:** `Customer A` observes `Booking_1` intact with identical `Booking_1` UUID and `Booked` status, proving the rejected `409` attempt did not mutate or disclose protected state (Lab 6 §3.2).
- **Step 7:** `Tutor B` sees only `Tutor B`'s own schedule (`Slot_1` and `Booking_1` are absent), and the guessed `?tutorId=...` probe is rejected with HTTP **`400`** (`INVALID_INPUT`) disclosing zero foreign Tutor records (`AC-S1-07`, `AC-S1-33`).

---

### UAT-NT-05 — Booking State & Persistence Across Reload, Re-Login, and Coordinated Redeploy

| Field | Detail |
| --- | --- |
| **Category** | State / History / Persistence Case (Lab 6 §3.1) |
| **Mapped Requirements & ACs** | `F-S1-02` (`AC-S1-08`), `F-S1-05` (`AC-S1-30`, `AC-S1-32`; conditional `AC-S1-34`) |
| **Purpose** | Verify committed Slot and Booking records survive browser hard-reload, sign-out/re-login, and (only if coordinated) service restart/redeploy. |
| **Roles Required** | `Customer A (Primary)`, `Tutor A (Primary)` |
| **Preconditions** | `Booking_1` (`Slot_1`) was committed in `UAT-NT-01` (or reuse a known persisted `Booking ID` from private ledger). |
| **Synthetic Inputs** | `Persisted Booking ID`: `Booking_1` UUID; `Persisted Slot ID`: `Slot_1` UUID. |

**Numbered User Actions:**
1. Sign in as `Customer A (Primary)`, click **การจองของฉัน** (`My bookings`), and verify `Booking_1` is listed.
2. Perform a hard browser refresh (`Ctrl+Shift+R` / reload `/`). Because the Customer view initializes on the availability tab (`activeTab = 'availability'`), click **การจองของฉัน** again and inspect `Booking_1`.
3. Click **ออกจากระบบ**, open a new incognito window, sign back in as `Customer A (Primary)`, click **การจองของฉัน**, and reopen `Booking_1` detail. Click **ออกจากระบบ**.
4. *(Conditional `AC-S1-34` — only if a booked appointment whose end time has already passed exists on `Customer A`)*: Inspect that past booking in **การจองของฉัน**; if none exists, record `AC-S1-34` manual check as `NOT RUN (no past-ended fixture)`.
5. *(Conditional redeploy check — only if coordinated with Product Team)*: After Product Team confirms a Cloud Run revision restart/redeploy, repeat Step 3 for `Customer A` and `Tutor A`.

**Specific Expected Results:**
- **Steps 2 & 3:** After navigating back to **การจองของฉัน**, `Booking_1` remains visible with identical `Booking ID`, `Tutor A` (`TUTOR-0a340de8`), `Test Date 14:00–15:00` (Bangkok time), and `Booked` status.
- **Step 4 (if executed):** Past appointment remains `Booked` (may show `Past` time state) and does **not** fabricate an attendance/completed status (`AC-S1-34`).
- **Step 5 (if executed):** Record survives Cloud Run revision restart/redeploy in Cloud SQL `nuttiew-pg` with no data loss.

---

### UAT-NT-06 — Asia/Bangkok Timezone Invariance Across Non-Bangkok Browser Locale

| Field | Detail |
| --- | --- |
| **Category** | Boundary / Timezone Case (Lab 6 §3.1) |
| **Mapped Requirements & ACs** | `F-S1-02` (`AC-S1-14`), `F-S1-03` (`AC-S1-18`) |
| **Purpose** | Verify that Tutor and Customer views render the exact same `Asia/Bangkok` appointment date and hour (`14:00–15:00` or `13:00–14:00`) even when the tester's browser timezone is set to `UTC`. |
| **Roles Required** | `Tutor A (Primary)`, `Customer A (Primary)` |
| **Preconditions** | `Slot_1` (`Test Date 14:00–15:00` Asia/Bangkok) or `Slot_2` (`Boundary Date 13:00–14:00`) exists. |
| **Synthetic Inputs** | Browser DevTools Sensors timezone override: `UTC` (`Etc/UTC`). |

**Numbered User Actions:**
1. Set the browser timezone override to `UTC` (Chrome DevTools -> Sensors -> Location/Timezone -> `UTC`, or launch browser with `TZ=UTC`).
2. Sign in as `Tutor A (Primary)` and inspect `Slot_1` (`Test Date 14:00–15:00`) or `Slot_2` (`Boundary Date 13:00–14:00`). Click **ออกจากระบบ**.
3. Keep the browser timezone at `UTC`, sign in as `Customer A (Primary)`, click **การจองของฉัน**, and view `Booking_1` (or view `Slot_2` in availability).
4. Click **ออกจากระบบ** and restore normal browser timezone.

**Specific Expected Results:**
- **Steps 2 & 3:** Both Tutor and Customer UI display the exact `Asia/Bangkok` date and hour (`14:00–15:00` for `Slot_1` / `13:00–14:00` for `Slot_2`), with **zero** `-07:00` shift to `07:00–08:00` UTC.

---

## 3. Sprint 1 AC Traceability (Manual UAT vs. Automated CI/DB Coverage)

| Sprint 1 Feature | Manual UAT Cases (`UAT-NT-01..06`) | Automated-Only or Conditional Coverage (With Contract Test IDs) |
| --- | --- | --- |
| `F-S1-01` Auth & Role/Owner | `AC-S1-01..07` -> `UAT-NT-01`, `UAT-NT-03`, `UAT-NT-04` | Also covered by `e2e/auth*.spec.ts`, `AUTH-09`, `SLOT-08`, `SLOT-20` |
| `F-S1-02` Tutor Slots | `AC-S1-08`, `AC-S1-09`, `AC-S1-10`, `AC-S1-12`, `AC-S1-14` -> `UAT-NT-01`, `UAT-NT-02`, `UAT-NT-06` | `AC-S1-11` (different Tutor same `13:00–14:00` window -> `SLOT-05` in `docs/features/F-S1-02/tests.md`); `AC-S1-13` (concurrent overlapping Slot race `RACE-S1-A`) -> automated PostgreSQL 18 CI test |
| `F-S1-03` Availability | `AC-S1-15`, `AC-S1-16`, `AC-S1-18` -> `UAT-NT-01`, `UAT-NT-04`, `UAT-NT-06` | `AC-S1-17`: `UX-CAL-04`/`UX-CAL-05` (PASS for stale-selection UI/calendar refresh & booking path) + `BOOK-07` (`docs/features/F-S1-04/tests.md` backend `SLOT_UNAVAILABLE` rejection); `AVA-11` in `docs/features/F-S1-03/verification-ledger.md` remains `BLOCKED` (live two-session stale-before-submit UI race is not executed in this manual UAT script) |
| `F-S1-04` Booking | `AC-S1-19`, `AC-S1-22` -> `UAT-NT-01`, `UAT-NT-04` | `AC-S1-20` (exact `14:00:00` cutoff), `AC-S1-21` (`BOOK-03` exact `14:00:01` cutoff in `docs/features/F-S1-04/tests.md`), `AC-S1-23..27`, `AC-S1-28` (`BOOK-09` forged request body), `AC-S1-29` (`BOOK-33`), `AC-S1-35` -> automated API/PostgreSQL suite |
| `F-S1-05` Protected Retrieval | `AC-S1-30..33` -> `UAT-NT-01`, `UAT-NT-04`, `UAT-NT-05` | `AC-S1-34` (past-ended `Booked` state) -> conditional manual check in `UAT-NT-05` if a real past-ended fixture exists + automated `RET-07`, `RET-15`, `RET-17` (`docs/features/F-S1-05/tests.md`) |

---

## 4. Partner Execution Record and Review Sign-Off

### 4.1 UAT Execution Record Table (For Partner UAT Team `TH-056_P2`)

**Partner team roster `TH-056_P2` (`PEW-DIY`):** Peepipat Suesoongnuen and Phalat Amachayapha (per partner Lab 5 team roster). The evidence source appears in each row; case-by-case student tester attribution still awaits partner confirmation.

**Release recorded for comparison:** Commit `42bb76247b257a4d9eff402f2e6b60a2ba44eda4` and revision `nuttiew-00010-gug` are the last CD-confirmed baseline. The partner runs reached the public URL on **22 Nov 2026 (ICT)**; live serving revision and traffic split during those runs await Cloud Run confirmation.

| Case ID | UAT Team and Evidence Source | Date / Time (ICT) | Release Commit / Revision | Inputs Used (Non-Secret) | Actual Result (Observed) | Observed Outcome (`PASS`/`FAIL`/`BLOCKED`) | Evidence ID |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `UAT-NT-01` | `TH-056_P2` · Codex | 22 Nov 2026, 19:51:09–19:51:15 | `42bb762` / `nuttiew-00010-gug` (CD baseline) | Tutor A and Customer A, 22 Dec 2026 at 14:00 ICT | Tutor A published a 60-minute Slot and Customer A booked it and opened the booking detail. Tutor A saw the Slot marked `Occupied` and the booking with a `CUST-…` reference. The Tutor screen showed no Customer email. | **PASS** | `NT-E01` (§5.1) |
| `UAT-NT-02` | `TH-056_P2` · Codex | 22 Nov 2026, 19:49:55–19:49:58 | `42bb762` / `nuttiew-00010-gug` (CD baseline) | 23 Dec 2026 at 13:00, 13:30 and 14:00 ICT, plus 21 Nov 2026 at 10:00 ICT | The 13:00–14:00 and 14:00–15:00 Slots persisted. The overlap attempt returned `409 SLOT_OVERLAP` and the past-date attempt returned `422 SLOT_INVALID_TIME`. The Slot count stayed the same after each rejection. | **PASS** | `NT-E02` (§5.1) |
| `UAT-NT-03` | `TH-056_P2` · Codex, Copilot, Gemini | 22 Nov 2026, 19:47–20:00:27 (Codex), 20:30 (Gemini), Copilot time unrecorded | `42bb762` / `nuttiew-00010-gug` (CD baseline) | No active session, an invalid password and the Tutor A and Customer A roles | Signed-out and post-logout access returned `401`. The invalid password was rejected and granted no workspace. Both Customer-to-Tutor requests and the Tutor-to-Customer request returned `403 FORBIDDEN`. | **PASS** | `NT-E03` (§5.1) |
| `UAT-NT-04` | `TH-056_P2` · Codex, Gemini | 22 Nov 2026, 20:00:40–20:00:45 (Codex), 20:30 (Gemini) | `42bb762` / `nuttiew-00010-gug` (CD baseline) | Customer B and Tutor B, using each run's booked Slot | Customer B could not select the occupied Slot, and Tutor B saw only their own schedule. Gemini recorded `404 BOOKING_NOT_FOUND`, `409 SLOT_UNAVAILABLE` and `400 INVALID_INPUT` for the three API checks. Customer A reopened the same `Booked` record after the rejected attempt. | **PASS** | `NT-E04` (§5.1) |
| `UAT-NT-05` | `TH-056_P2` · Codex | 22 Nov 2026, 20:00:19–20:00:23 | `42bb762` / `nuttiew-00010-gug` (CD baseline) | Customer A, the new booking and an existing past appointment | The booking ID, Tutor, interval and `Booked` status persisted after a cache-bypassing reload and a fresh browser session. The past appointment retained `Booked` with `displayStatus: Past`. The conditional redeploy check was **NOT RUN**. | **PASS** | `NT-E05` (§5.1) |
| `UAT-NT-06` | `TH-056_P2` · Codex | 22 Nov 2026, 20:00:23–20:00:26 | `42bb762` / `nuttiew-00010-gug` (CD baseline) | Chrome timezone set to `UTC`, Tutor A and Customer A | Both workspaces showed the 22 Dec appointment at 14:00–15:00 in `Asia/Bangkok`. | **PASS** | `NT-E06` (§5.1) |

### 4.2 Internal Team Review & Partner Handoff Checklist

| Gate | Owner | Status |
| --- | --- | --- |
| Case traceability & standalone readability reviewed by teammate | `@Tanaboonnnnn` | **VERIFIED** — [PR #113 approved and merged](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/113) |
| `Tutor B` & `Customer B` accounts active in Cloud SQL `nuttiew-pg` | Operator SQL output (21 Nov 2026) | **VERIFIED (DB)** |
| `Tutor A/B` & `Customer A/B` UI sign-ins | Partner UAT observations (22 Nov 2026 ICT) | **VERIFIED (UI)** — four successful sign-ins |
| Credentials delivered privately | Product Team (`@Tanaboonnnnn`, `@Chxtamos`) | **TEST ACCESS VERIFIED** — the supplied synthetic accounts worked; formal delivery acknowledgment remains unrecorded |
| Live Cloud Run revision and traffic split checked | Product Team (`@Tanaboonnnnn`, `@Chxtamos`) | **CD BASELINE VERIFIED** — `nuttiew-00010-gug` at 100% traffic on 21 Nov 2026 at 00:39 ICT ([CD run `44784128286`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/44784128286)); serving revision and split during the 22 Nov test window await live Cloud Run confirmation |
| Partner team `TH-056_P2` confirms receipt (session **Mon 23 Nov 2026, 13:30 ICT**) | Partner UAT Team (`TH-056_P2`) | **MATERIALS AVAILABLE FOR REVIEW** — the case file and test access were available for the 22 Nov runs; formal receipt & per-case student attribution by the named testers await confirmation |

### 4.3 Independent Acceptance Record

| Field | Recorded Value |
| --- | --- |
| **Product and acceptance scope** | NutTiew, delivered Sprint 1 (`F-S1-01`–`F-S1-05`) |
| **UAT team roster** | `TH-056_P2` (`PEW-DIY`) — Peepipat Suesoongnuen and Phalat Amachayapha |
| **Execution evidence** | 22 Nov 2026 ICT, `NT-E01`–`NT-E06` — passing observations for all six cases (see §5.1) |
| **Release record** | `42bb76247b257a4d9eff402f2e6b60a2ba44eda4` / `nuttiew-00010-gug` per CD; serving revision and traffic at test time await confirmation |
| **Decision, decision date and approving testers** | **UNRECORDED** — the independent student UAT team must confirm the tested release, identify the participating testers, and record its decision and date (`#110`) |
| **Conditional checks and observations** | Coordinated redeploy check for `UAT-NT-05` was **NOT RUN**. Tutor A's three contract-conforming non-PII identifier formats (`NT-OBS-01`) are triaged in [defect-triage-register.md](defect-triage-register.md) (`#107`). |

---

## 5. Partner UAT Execution Evidence Summary (`TH-056_P2` Return, 22 Nov 2026)

### 5.1 Observed Results & Redacted UAT Evidence Index

The partner runs reached `https://nuttiew-nxe2keefba-as.a.run.app/` on **22 Nov 2026 (ICT)** (Codex **19:47:05–20:00:45**, Gemini follow-up **20:30**, Copilot read-only observations). All 18 redacted UI screenshots supplied by `TH-056_P2` are archived in `docs/labs/lab-06/evidence/nuttiew-uat-2026-11-22/` (zero passwords, cookies, or tokens); raw session logs and fixture UUIDs remain in private evidence storage.

| Case ID | Evidence ID & Source | Archived Redacted Screenshots (`evidence/nuttiew-uat-2026-11-22/`) & Logs | Observed Outcome |
| --- | --- | --- | --- |
| `UAT-NT-01` | `NT-E01` · Codex | [login.png](evidence/nuttiew-uat-2026-11-22/login.png), [nt01-tutor-available-slot.png](evidence/nuttiew-uat-2026-11-22/nt01-tutor-available-slot.png), [nt01-customer-available-offer.png](evidence/nuttiew-uat-2026-11-22/nt01-customer-available-offer.png), [nt01-booking-confirmation.png](evidence/nuttiew-uat-2026-11-22/nt01-booking-confirmation.png), [nt01-customer-booking-detail.png](evidence/nuttiew-uat-2026-11-22/nt01-customer-booking-detail.png), [nt01-tutor-booked-row.png](evidence/nuttiew-uat-2026-11-22/nt01-tutor-booked-row.png) | **PASS** |
| `UAT-NT-02` | `NT-E02` · Codex | [nt02-adjacent-slot.png](evidence/nuttiew-uat-2026-11-22/nt02-adjacent-slot.png), [nt02-overlap-rejected.png](evidence/nuttiew-uat-2026-11-22/nt02-overlap-rejected.png), [nt02-past-slot-rejected.png](evidence/nuttiew-uat-2026-11-22/nt02-past-slot-rejected.png) | **PASS** |
| `UAT-NT-03` | `NT-E03` · Codex, Copilot, Gemini | [nt03-invalid-login.png](evidence/nuttiew-uat-2026-11-22/nt03-invalid-login.png), Copilot signed-out observations, Gemini API log (partner-held) | **PASS** |
| `UAT-NT-04` | `NT-E04` · Codex, Gemini | [nt04-customer-b-availability.png](evidence/nuttiew-uat-2026-11-22/nt04-customer-b-availability.png), [nt04-customer-b-bookings.png](evidence/nuttiew-uat-2026-11-22/nt04-customer-b-bookings.png), [nt04-tutor-b-bookings.png](evidence/nuttiew-uat-2026-11-22/nt04-tutor-b-bookings.png), Gemini API log (`404`/`409`/`400`, partner-held) | **PASS** |
| `UAT-NT-05` | `NT-E05` · Codex | [nt05-after-hard-reload.png](evidence/nuttiew-uat-2026-11-22/nt05-after-hard-reload.png), [nt05-after-new-session.png](evidence/nuttiew-uat-2026-11-22/nt05-after-new-session.png), [nt05-past-booking.png](evidence/nuttiew-uat-2026-11-22/nt05-past-booking.png) | **PASS** *(redeploy `NOT RUN`)* |
| `UAT-NT-06` | `NT-E06` · Codex | [nt06-utc-tutor-slot.png](evidence/nuttiew-uat-2026-11-22/nt06-utc-tutor-slot.png), [nt06-utc-customer-booking.png](evidence/nuttiew-uat-2026-11-22/nt06-utc-customer-booking.png) | **PASS** |

*Partner synthetic data footprint:* Six synthetic Slots and two Bookings across 22–24 and 27 Dec 2026 (original Codex `uat-execution-result.json` combined with Gemini API follow-up for `UAT-NT-03` and `UAT-NT-04`).

**Evidence provenance limitation (`UAT-NT-05` & `UAT-NT-06`):** `nt05-after-hard-reload.png`, `nt05-after-new-session.png`, and `nt06-utc-customer-booking.png` have the identical Git blob SHA (`dde5a0183b9d2c77c3699c4707c6eef65683231a`, 25,779 bytes). Because the Customer **My Bookings** card deterministically renders the exact same `Asia/Bangkok` interval and booking fields after a hard reload, fresh session, and `UTC` browser override, identical pixel output is plausible and does not imply misconduct; however, byte-identical screenshots alone do **not** independently establish fresh browser-context isolation or the `UTC` timezone override. Those step conditions currently rely on `TH-056_P2`'s partner-held `uat-execution-result.json` log; sanitized execution/context/timezone corroboration (or distinct captures showing DevTools timezone/session context) is tracked as an open verification gate in [defect-triage-register.md §5](defect-triage-register.md#5-partner-communication--open-verification-gates) ahead of final acceptance (`#110`).

**Handoff documentation observation (`NT-OBS-01` — triaged internally as `Not-defect`, external partner notification pending; see [defect-triage-register.md](defect-triage-register.md)):** `Tutor A` appears as `#1cb1d623` in the Tutor workspace, as the full opaque `tutorRef` ending in `1cb1d623` in Availability (`OD-AV-02`), and as `TUTOR-0a340de8` (`"TUTOR-" + tutorId.slice(0, 8)` per `docs/features/F-S1-05/data-spec.md:50`) in My Bookings and its detail view. All three refer to the same `Tutor A` account; `§1.2`, `UAT-NT-01`, `UAT-NT-04`, and `UAT-NT-05` above have been updated to state the exact expected reference in each view.
