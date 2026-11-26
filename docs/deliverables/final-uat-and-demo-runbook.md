# CPE334 NutTiew — Final UAT Checklist, Regression Matrix & Two-Student Demo Runbook (Issue #150 / S3-06)

> **STATUS: `PREPARED — NOT EXECUTED ON SPRINT 3 LIVE REVISION YET` (Updated 26 Nov 2026 ICT on `origin/sprint3@079de311ea2a87fcb61bd6d258d33f1e15637a23`).**
> **Honesty Guardrail:** This runbook defines the post-release verification checklist, synthetic test-account protocol, supported local vs. hosted CI verification separation, `<= 4`-minute joint two-student demo submission script (`project_final_delivery_v1.pdf` §§3.4, 3.5, 4.1), and Final Report evidence map for [Issue #150](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/150) (`OPEN`). Preparing this runbook does **not** satisfy Gate `G2`, does **not** claim live Sprint 3 testing, does **not** merge [PR #175](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/175), and does **not** assert completion of any screenshot, demo video, Final PDF, or LEB2 submission.

---

## 1. Pre-Execution Release Gate & Environment Checklist

Execute §3 (`FUAT-01`–`FUAT-12`) and §5 (Demo Video) **only after all preconditions below are verified**:

| Gate # | Required Precondition | Verification Method | Current Status |
|---|---|---|---|
| **PRE-01** | Gate `G2` closed by `@Tanaboonnnnn`: Sprint 2 live authenticated check (`C-05`), persistence/authorization proof, annotated S2 tag on `main@d3eaf11`, and team-endorsed forward-recovery decision for the known PG15 Lab 7 rollback incompatibility | Check [sprint3-release-gate-evidence.md](../sprints/sprint3-release-gate-evidence.md) & Issue `#120` | **`PENDING` (`G2 BLOCKED`)** |
| **PRE-02** | [PR #175](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/175) (`sprint3 -> main`) reviewed/approved after `G2` closure, merged to `main`, and `main` push `NutTiew CI` passes `3/3` on the exact merged `main` SHA | `gh pr view 175` + `gh run list --branch main` | **`PENDING` (`PR #175 OPEN`)** |
| **PRE-03** | Explicit release authorization: `DEPLOY_ENABLED="true"`, `.github/workflows/deploy.yml` dispatched on exact merged `main` SHA (`demo` environment approved), migration job + Cloud Run revision at `100%` traffic + matching digest, `DEPLOY_ENABLED="false"` restored immediately after | [deploy.yml](../../.github/workflows/deploy.yml) + repository vars + Cloud Run check | **`PENDING`** |
| **PRE-04** | Annotated Sprint 3 release tag created on the verified `main` SHA | `git fetch origin --tags && git tag -n9` | **`PENDING`** |
| **PRE-05** | Clean target origin verified before UAT session: `https://nuttiew-nxe2keefba-as.a.run.app` (`/api/ready` HTTP `200`) and private recheck of synthetic account sign-ins | `GET /api/ready` + private sign-in recheck | **`PENDING S3 DEPLOY`** |

---

## 2. Synthetic Test Accounts & Non-Destructive Data Rules (No Secrets in Git)

### 2.1 Existing Role-Labelled Synthetic Accounts (Cloud SQL `nuttiew-pg`)

Per [uat-cases-and-handoff.md](../labs/lab-06/uat-cases-and-handoff.md) §1.2, four role-labelled synthetic accounts already exist in Cloud SQL `nuttiew-pg`. **Account sign-in readiness recorded below rests on Lab 6 verification evidence from 21–22 Nov 2026 (`nuttiew-00010-gug`); all four synthetic accounts MUST be privately re-verified for live sign-in before executing Final UAT.** Passwords and private credentials are exchanged strictly through the private team channel — never commit passwords, session cookies, CSRF tokens, or real Student IDs into Git, PRs, screenshots, or the Final PDF.

| Account Label | Role | Identifier / Public Suffix Reference & Provenance | Purpose in Final Live UAT & Demo |
|---|---|---|---|
| `Tutor A (Primary)` | `Tutor` | `tutor.demo@example.test` (`#1cb1d623`, `TUTOR-0a340de8`; Lab 6 UI sign-in verified 22 Nov 2026 — **recheck before Final UAT**) | Create future Slots (`Q03/Q06`), `< 90m` fixture Slot, Tutor cancellation with `OD-014`, unoccupied Slot withdrawal (`Q27/Q32`), `Tutor A` Summary (`Booking_2`, `Booking_3`), and cross-Tutor denial probe |
| `Tutor B (Secondary)` | `Tutor` | Shared privately via team channel (Lab 6 Cloud SQL + UI sign-in verified 21–22 Nov 2026 — **recheck before Final UAT**) | Cross-Tutor overlap (`FUAT-03`), reschedule destination (`Q12` in `FUAT-05`), `Tutor B` Summary (`200 OK` containing own `Booking_1`, zero `Tutor A` rows), and unoccupied withdrawal (`FUAT-07`) |
| `Customer A (Primary)` | `Customer` | `customer.demo@example.test` (`#2a4a7fc5`; Lab 6 UI sign-in verified 22 Nov 2026 — **recheck before Final UAT**) | Browse availability, valid booking (`>= 90m`), `< 90m` `POST` cutoff rejection (`422`), Customer cancel (`>= 30m`), one-time reschedule (`>= 60m`), reread durable Tutor notice (`NFR-014`), and Customer `403` on Tutor summary |
| `Customer B (Secondary)` | `Customer` | Shared privately via team channel (Lab 6 Cloud SQL + UI sign-in verified 21–22 Nov 2026 — **recheck before Final UAT**) | Occupied-Slot `POST` probe (`409 SLOT_UNAVAILABLE`), foreign Booking/Notification `404` probes, and foreign S2 mutation probes (zero `Customer A` records or `OD-014` reason leaked) |

### 2.2 Reproducible Local/Disposable Seed Interface (`apps/api/prisma/seed.ts`)

For local or disposable PostgreSQL verification (never against production with guessed/reset commands):
- [apps/api/prisma/seed.ts](../../apps/api/prisma/seed.ts) requires `DATABASE_URL_APP`, `SEED_EMAIL`, `SEED_PASSWORD` (minimum 12 UTF-8 bytes), and `SEED_ROLE=Customer|Tutor` via environment variables (`npm run db:seed`), using `argon2id` and `ON CONFLICT("email") DO NOTHING`.

### 2.3 Non-Destructive Production DB Rules for Live UAT

1. **Never reset, restore, or delete production rows:** `prisma migrate reset`, `TRUNCATE`, `DELETE`, direct SQL time/row tampering, and production rollback/restore trials against Cloud SQL `nuttiew-pg` are strictly prohibited. PITR is not enabled on `nuttiew-pg`.
2. **Use unique future `Asia/Bangkok` dates:** Avoid previously used test dates (`2026-12-09` from Lab 5, `2026-12-20`/`2026-12-21` from Lab 6, and dates used in Sprint 2 `C-05`/UAT). Choose unambiguous unused future dates on execution day (e.g., `Date_1 = 2026-12-26`, `Date_2 = 2026-12-27`), plus one controlled near-cutoff future slot on the execution day for `FUAT-03` `< 90m` testing.
3. **Role & header hygiene:** Always click **ออกจากระบบ** (`Sign Out`) or use an isolated browser context between role switches (`Tutor A`, `Tutor B`, `Customer A`, `Customer B`). For direct authenticated `POST` contract probes (`FUAT-03`, `FUAT-09`), always obtain a fresh live session cookie, canonical `Origin`, `X-CSRF-Token` from `GET /api/v1/auth/csrf`, and `X-NutTiew-Expected-Session-Binding` from `GET /api/v1/auth/me` unless specifically testing rejection of a missing/mismatched header.
4. **Private fixture ledger:** Record created `Slot` UUIDs, `Booking` UUIDs, `Notification` UUIDs, and timestamps locally during testing so before/after restart persistence checks (`FUAT-11`) match exact records.

---

## 3. Executable 3-Sprint Final Live UAT Checklist (`FUAT-01`–`FUAT-12`)

### 3.1 Final UAT Cases (`NOT RUN` until Sprint 3 deploy completes)

> Save sanitized screenshots (no passwords, no `Cookie`/`Set-Cookie` headers, no raw secrets) under `docs/deliverables/evidence/final-s3-<YYYY-MM-DD>/` only **after** authorized Sprint 3 deployment. All cases below start as **`NOT RUN`** and require recording **both** HTTP status and error code (`actual status / code`).

| ID | Sprint / Scope | Requirements & Contracts | Test Steps on Live Deployed Sprint 3 App | Expected Observable Outcome | Planned Screenshot | Status |
|---|---|---|---|---|---|---|
| **`FUAT-01`** | **S1 Auth + Lab 6 `#139`/`#140`** | `F-S1-01`; `FR-001..004`; `NFR-001/002/015`; `AC-S1-01..05` | 1. Submit wrong password for `Customer A`.<br>2. Execute `RT-04` NUL-byte email login check.<br>3. Sign in with valid `Customer A` credentials, inspect `/api/v1/auth/me`, click **ออกจากระบบ**, and replay protected `GET /api/v1/auth/me` or `/api/v1/customer/bookings`. | 1. Wrong password → **`401 LOGIN_FAILED`** (no session cookie).<br>2. NUL-byte email → **`400 INVALID_INPUT`** (never `503`).<br>3. Valid login → `200` own role workspace; post-logout replay → **`401 UNAUTHENTICATED`**. Record actual status/code separately. | `FUAT-01-auth-guard.png` | **`NOT RUN`** |
| **`FUAT-02`** | **S1 Tutor Explicit Slots** | `F-S1-02`; `Q03/Q04/Q06`; `FR-005..007`; `BR-003/004/006`; `AC-S1-08..12` | As `Tutor A`, create `Slot_A1` (`Date_1 13:00–14:00`), try overlapping `13:30–14:30`, create adjacent `Slot_A2` (`Date_1 14:00–15:00`), and submit yesterday in `Asia/Bangkok`. | `Slot_A1` persisted as exact `60`-min `Offered` / `Unoccupied`; overlap `13:30–14:30` rejected (**`409 SLOT_OVERLAP`**), `Slot_A1` unchanged; adjacent `Slot_A2` accepted (`201`); past date rejected (**`422 SLOT_INVALID_TIME`**). | `FUAT-02-tutor-slots.png` | **`NOT RUN`** |
| **`FUAT-03`** | **S1 Discovery, Booking, Lab 7 `Q05 = 90m` & Occupied Probe** | `F-S1-03/04/05`; `Q01/Q05/Q28`; `BR-001/005/028`; `CR-L7-01`; `AC-S1-15/19..23` | 1. As `Tutor A`, create synthetic future `Slot_ShortNotice` starting **`< 90m`** ahead (e.g. `~40m` ahead, strictly future); capture `slotId` (`data.id` / `data-slot-id`).<br>2. As `Customer A`, verify `Slot_ShortNotice` is **not** bookable in availability UI, then submit authenticated `POST /api/v1/customer/bookings` for `Slot_ShortNotice` (valid cookie + `Origin` + `X-CSRF-Token` + `X-NutTiew-Expected-Session-Binding`).<br>3. Book `Slot_A1` (`>= 90m` → `Booking_1`).<br>4. As `Tutor B`, offer `Date_1 13:00–14:00`; `Customer A` tries booking it.<br>5. As `Customer B`, verify `Slot_A1` is hidden from availability and submit authenticated `POST /api/v1/customer/bookings` targeting `Slot_A1`. | 1–2. `Slot_ShortNotice` is hidden in availability; direct authenticated `POST` fails closed with **`422 BOOKING_NOT_ELIGIBLE`** (zero Booking created).<br>3. `Booking_1` commits (`201`, `Booked`, pseudonymous `CUST-...` on `Tutor A`, `TUTOR-...` on `Customer A`).<br>4. Cross-Tutor overlap fails **`409 CUSTOMER_OVERLAP`**.<br>5. `Customer B` `POST` on occupied `Slot_A1` fails **`409 SLOT_UNAVAILABLE`** with zero `Customer A` data leaked and `Booking_1` intact. | `FUAT-03-s1-q05-booking.png` | **`NOT RUN`** |
| **`FUAT-04`** | **S2 Customer Cancel & Atomic Reopen** | `F-S2-01`; `Q07/Q08`; `FR-020/021`; `BR-007/008` | `Tutor A` creates `Slot_A3` (`Date_1 16:00–17:00`); `Customer A` books (`Booking_2`, `>= 90m`); `Customer A` cancels `Booking_2` (`>= 30m` before start). | `Booking_2` becomes `Cancelled` (`cancellationActor: Customer`, `cancellationReason: null`); `Slot_A3` atomically reopens as bookable offer (still subject to `Q05 = 90m` for any new booking). | `FUAT-04-customer-cancel.png` | **`NOT RUN`** |
| **`FUAT-05`** | **S2 Cross-Tutor One-Time Reschedule** | `F-S2-02`; `Q09..Q16`; `FR-022..027`; `BR-009..016` | `Tutor B` creates `Slot_B1` (`Date_2 10:00–11:00`) and `Slot_B2` (`Date_2 15:00–16:00`); `Customer A` reschedules `Booking_1` (`>= 60m` both ends) from `Slot_A1` (`Tutor A`) to `Slot_B1` (`Tutor B`), then attempts a second reschedule to `Slot_B2`. | First reschedule returns `200 OK`: exact **`Booking_1` UUID preserved**, `Slot_A1` reopened, `Slot_B1` occupied, assigned Tutor becomes `Tutor B`. Second reschedule rejected (**`409 RESCHEDULE_ALREADY_USED`**), `Slot_B1` unchanged. | `FUAT-05-reschedule-once.png` | **`NOT RUN`** |
| **`FUAT-06`** | **S2 Tutor Cancel (`OD-014`) & Durable Notice** | `F-S2-03/04`; `Q17..Q25`; `OD-014`; `NFR-014` | 1. **Booking step (`Q05 >= 90m`):** Confirm `Slot_A2` (`Tutor A`, `Date_1 14:00–15:00`) starts **`>= 90m`** ahead when `Customer A` creates new `Booking_3` (new booking obeys `CR-L7-01` `90m`, NOT `60m`).<br>2. **Tutor cancel step (`Q18 >= 60m`):** As `Tutor A` (while `Slot_A2` starts `>= 60m` ahead), try blank/symbol-only reason (`...`), then cancel `Booking_3` with valid letter reason (`OD-014`).<br>3. Sign in as `Customer A`, inspect notice + cancelled `Booking_3` detail, mark read, and reopen. | 1. `Booking_3` commits (`201`, `Booked`) only because `>= 90m` holds.<br>2. Blank/symbol-only reason → **`400 INVALID_INPUT`**; valid reason (at `>= 60m`) → `200 OK`, `Booking_3` `Cancelled`, `Slot_A2` **`Withdrawn`** (not reoffered).<br>3. `Customer A` sees exact reason in durable notice (`readAt` persists) and cancelled detail; remains rereadable (`NFR-014`). | `FUAT-06-tutor-cancel-notice.png` | **`NOT RUN`** |
| **`FUAT-07`** | **S2 Unoccupied Slot Withdrawal & Replacement** | `F-S2-05`; `Q26/Q27/Q32`; `FR-033/034`; `BR-026/027/032` | As `Tutor B`, try withdrawing occupied `Slot_B1` (`Booking_1`); withdraw unoccupied `Slot_B2` (`Date_2 15:00–16:00`); create replacement `Slot_B3` on `Date_2 15:00–16:00`. | Occupied `Slot_B1` withdrawal → **`409 SLOT_OCCUPIED`**; unoccupied `Slot_B2` → `200 OK`, `lifecycle: Withdrawn`; replacement `Slot_B3` → `201` with a **new Slot UUID** (`Slot_B2` stays historical). | `FUAT-07-slot-withdraw-newid.png` | **`NOT RUN`** |
| **`FUAT-08`** | **S3 Tutor Appointment Summary (`OD-006`/`OD-009`)** | `F-S3-01`; `Q30/Q31`; `FR-035`; `BR-030/031`; `NFR-016` | Inspect `GET /api/v1/tutor/summary` UI & JSON for **both** `Tutor A` (`Booking_2` Customer-cancelled, `Booking_3` Tutor-cancelled, any preexisting Past rows) and `Tutor B` (`Booking_1` Upcoming Booked, any preexisting Past/Cancelled rows).<br>*Note on `Past` / `In-Progress` without DB tampering:* observe any preexisting real past `Booked` rows for `Past Booked`; for `In-Progress Booked`, either pre-book an eligible `>= 90m` synthetic slot earlier and observe during `startsAt <= evaluatedAt < endsAt` **or** record live `In-Progress` / `Past` explicitly as `NOT RUN / INCOMPLETE` citing automated `SUM-02`/`SUM-09`/`SUM-10`. | Every category `count === list.length` under one `meta.evaluatedAt`; **`Tutor B` shows `Booking_1` in `Upcoming Booked`** (zero `Tutor A` rows); `Tutor A` shows `Booking_2` + `Booking_3` in `Cancelled` (`tutorCancellationReason` and Customer email omitted); any `In-Progress Booked` keeps status `Booked`; any `Past Booked` never asserts `Completed`. | `FUAT-08-tutor-summary-4buckets.png` | **`NOT RUN`** |
| **`FUAT-09`** | **Negative Authorization, Ownership & CSRF/Binding Matrix** | `F-S1-01/05`, `F-S2-01..05`, `F-S3-01`; `NFR-001/007/015`; `SUM-03/05/09` | Execute each negative probe with full contract distinctions:<br>• `GET /api/v1/tutor/summary`: anonymous; `Customer A`; `Tutor B` (`200` own-only); `Tutor B` `?tutorId=<TutorA>`.<br>• Foreign Customer reads (`GET /api/v1/customer/bookings/:id`, `GET /api/v1/customer/notifications/:id`): anonymous; `Tutor`; `Customer B` probing `Customer A`'s `Booking_1` / `Booking_3` notification ID.<br>• S2 Customer mutations (`POST .../cancel`, `.../reschedule`, `.../notifications/:id/read`) & S2 Tutor mutations (`POST /api/v1/tutor/bookings/:id/cancel`, `POST /api/v1/tutor/slots/:id/withdraw`): wrong role; foreign owner with valid session+Origin+CSRF+binding (`Tutor A` cancelling moved `Booking_1`, `Tutor B` withdrawing `Slot_A1`, `Customer B` cancelling/rescheduling/reading `Booking_1`/notice); missing/mismatched `X-CSRF-Token`, `X-NutTiew-Expected-Session-Binding`, foreign `Origin`. | • Summary: anon **`401 UNAUTHENTICATED`**; Customer **`403 FORBIDDEN`**; `Tutor B` **`200 OK` own-only** (`Booking_1` present, zero `Tutor A` rows); `?tutorId=` **`400 INVALID_INPUT`**.<br>• Foreign reads/mutations (valid headers): wrong role **`403 FORBIDDEN`**; foreign `Customer B` **`404 BOOKING_NOT_FOUND`** / **`404 NOTIFICATION_NOT_FOUND`** (never `403`); unassigned/foreign Tutor **`404 BOOKING_NOT_FOUND`** / **`404 SLOT_NOT_FOUND`**.<br>• Header guards: **`403 CSRF_DENIED`**, **`403 SESSION_BINDING_MISMATCH`**, **`403 ORIGIN_DENIED`**. Record actual status + code for every probe; zero private leaks. | `FUAT-09-negative-auth.png` | **`NOT RUN`** |
| **`FUAT-10`** | **Non-Bangkok Browser Timezone Fidelity** | `SYS-01`; `Q29`; `BR-029`; `NFR-006`; `AC-S1-14/18`; `SUM-08/10` | Launch browser with timezone overridden to `America/Los_Angeles` (or `UTC`), open `Tutor B` Summary (`Booking_1`) and `Customer A` Bookings. | All appointment dates/hours still display exact intended `Asia/Bangkok` calendar dates and times matching Bangkok session views. | `FUAT-10-timezone-bangkok.png` | **`NOT RUN`** |
| **`FUAT-11`** | **Controlled Restart / Redeploy Persistence (`NFR-003` & Handout §3.4)** | `SYS-01`; `FR-016/019`; `NFR-003`; `#149` AC #3; `project_final_delivery_v1.pdf` §3.4 | **Before restart/redeploy:** record exact `Slot`/`Booking`/`Notification` UUIDs (`Booking_1`, `Booking_2`, `Booking_3`, `Slot_A1..3`, `Slot_B1..3`, notice ID, preexisting records), Cloud Run revision ID, `meta.evaluatedAt`, and UTC/ICT timestamp on `nuttiew-pg`.<br>**Controlled restart/redeploy (only on authorized Sprint 3 `main` SHA):** execute an authorized controlled Cloud Run revision replacement/redeploy of the **exact assessed Sprint 3 `main` SHA** against the **same Cloud SQL `nuttiew-pg` database** (never run production rollback/restore).<br>**After restart/redeploy:** hard-reload + fresh login session; record the **new** Cloud Run revision ID / container start timestamp, `meta.evaluatedAt`, and verify all before-IDs/statuses/notices survive on the same DB. Compute Summary bucket membership **against the new `meta.evaluatedAt` snapshot** (do **not** assume identical bucket counts if wall-clock time crossed a slot start/end). | New Cloud Run revision serves `100%` traffic against the same `nuttiew-pg` DB; zero lost rows across all before-recorded `Booking`/`Slot`/`Notification` IDs and preexisting records; Summary counts equal list lengths matching exact `startsAt`/`endsAt` predicates under the post-restart `meta.evaluatedAt`. | `FUAT-11a-before-restart.png` & `FUAT-11b-after-restart.png` | **`NOT RUN`** |
| **`FUAT-12`** | **Release Integrity, Tag & Independent Acceptance Audit** | `NFR-011/012/013`; `#149` AC #3–#4; `#150` AC #1 | Verify merged `main` SHA, `main` Push `NutTiew CI` `3/3`, `NutTiew CD` `3/3`, Cloud Run revision (`100%` traffic + matching digest), `DEPLOY_ENABLED="false"`, annotated Sprint 3 Git tag, and review independent tester execution ledger (§3.2). | Exact SHA, CI/CD runs, revision/digest, `DEPLOY_ENABLED="false"`, Sprint 3 tag, and §3.2 records match `sprint3-release-gate-evidence.md` & `final-delivery-handoff.md`. | `FUAT-12-cloud-run-release.png` | **`NOT RUN`** |

### 3.2 Lab 6 Retest Crosswalk, Independent Acceptance Boundary & Execution Record Template (`NOT EXECUTED`)

- **Independent Acceptance Rule:** Developer/author self-execution of `FUAT-01`–`FUAT-12` constitutes **developer pre-release / verification testing**, **not** independent partner/stakeholder acceptance. Record `Tester & Role` honestly on every line (`Developer Self-Check (@Chxtamos / @Tanaboonnnnn)` vs `Independent Acceptance Tester`).
- **Lab 6 Retest Crosswalk:**
  - `UAT-NT-01` (S1 Offer/Discovery/Book/Pseudonymous View) → re-verified in `FUAT-02` & `FUAT-03`.
  - `UAT-NT-02` (Slot Overlap, Adjacent, Past-Date) → re-verified in `FUAT-02`.
  - `UAT-NT-03` (Invalid Login `401 LOGIN_FAILED`, Logout `401 UNAUTHENTICATED`, Cross-Role `403 FORBIDDEN`) → re-verified in `FUAT-01` & `FUAT-09`.
  - `UAT-NT-04` (Cross-Customer/Tutor Isolation & Occupied `409 SLOT_UNAVAILABLE`) → re-verified in `FUAT-03` (`Customer B` probe) & `FUAT-09`.
  - `UAT-NT-05` (Persistence & Past-Not-Completed) → re-verified in `FUAT-08` & `FUAT-11` (expanded with real Cloud Run restart/redeploy).
  - `UAT-NT-06` (Non-Bangkok Browser Timezone) → re-verified in `FUAT-10`.
  - `DEF-NT-TH038-01` / `#139` / `RT-04` (`NUL` email `400 INVALID_INPUT`) & `#110` baseline boundary → re-verified in `FUAT-01` and separated in `final-delivery-handoff.md` §4.

#### Post-Deploy UAT Execution Record Template (Fill Only After Sprint 3 Deploy)

| Case ID | Mapped Lab 6 / SRS ID | Tester & Role (`Self` vs `Independent`) | Time (ICT) | Tested `main` SHA & Cloud Run Revision | Expected Result (Status / Error Code / UI) | Actual Observed Result (Status / Error Code / UI) | Evidence / Screenshot Path | Verdict (`PASS` / `FAIL` / `SKIPPED` / `NOT RUN`) | Defect / Retest Link |
|---|---|---|---|---|---|---|---|---|---|
| `FUAT-01`..`12` | *See §3.1* | *TBD* | *TBD* | *TBD* | *See §3.1* | *Pending authorized Sprint 3 deploy* | *TBD* | **`NOT RUN`** | *None yet* |

---

## 4. Automated Regression Verification Matrix & Supported Commands

### 4.1 Latest Verified Hosted CI Baseline (`sprint3@079de311ea2a87fcb61bd6d258d33f1e15637a23`)

Verified across both [PR #175 CI Run `45784163751`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45784163751) and [`sprint3` Push CI Run `45784152146`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45784152146) (identical code/test state as `b9b336d` `348/348` breakdown):

| CI Job (`.github/workflows/ci.yml`) | Covered Suites & Verification Gates | Verified Result on `079de31` |
|---|---|---|
| **`Unit / types / build`** | `npm run db:generate`, `npm test` (`@nuttiew/api` 6 unit files + `@nuttiew/web` 2 unit files), `npm run typecheck`, `npm run build`, `docker build --target runtime`, `docker compose config --quiet`, `verify_compose_volume.py`, `verify_container_script_eol.py`, `bash deploy/tests/run_all_offline.sh` | **`SUCCESS`** (Jobs `139786628266`, `139786592473`) |
| **`PostgreSQL 18 / Auth / Slot / Race A`** | All 7 forward-only Prisma migrations, `test-booking-baseline-upgrade.sh` (`BDF-02`), `test-s2-lab7-upgrade.sh` (`S2_LAB7_UPGRADE_AND_Q05_90M_PASS`), `prepare-test-db.sh` (least-privilege runtime role), `npm run test:db` (20 DB integration/concurrency/restart files), plus `apps/api/test/s2.shared-migration.db.test.ts` | **`SUCCESS`** (Jobs `139786628560`, `139786592934`) |
| **`Microsoft Edge / Auth / Tutor UI E2E`** | Non-owner runtime DB role + `npx playwright install --with-deps msedge` + `npm run test:e2e -- --reporter=line,html` across all Playwright specs including `e2e/summary.spec.ts` (`SUM-08`, `SUM-08b`, `SUM-10`) | **`SUCCESS`** (Jobs `139786628708`, `139786592965`) |

> **Note on `AUTH-22` & PG15:** `apps/api/test/auth.barrier.db.test.ts` passed on `079de31`, `b9b336d`, and `8187bc4` after a single observed failure (`expected 13 to be 5`) on PR `#173` Run `45644905166` Attempt 1 (suspected IP-bucket collision in `192.0.2.1`–`192.0.2.240`, root cause unproven). Full E2E ran on hosted PostgreSQL 18; hosted Cloud SQL is PostgreSQL 15.19 (local PG 15.17 migration + transition rehearsal verified in `#120` checkpoint without rerunning full E2E on PG 15).

### 4.2 Supported Local Disposable Workflow vs. Hosted GitHub Actions CI-Only Verification

#### 4.2.1 Supported Local Commands (Disposable Local Setup per [README.md](../../README.md))

Prerequisites before running local suites against an **isolated local/disposable database** (never point at production `nuttiew-pg`):
1. **Node.js & npm:** Node `>=24 <25` (`npm ci`, `npm run db:generate`).
2. **Offline Python/Container deps (for deploy/Compose offline checks):** Docker Engine + Compose, plus `python -m pip install -r deploy/tests/requirements.txt` (installs pinned `PyYAML`).
3. **Disposable Local PostgreSQL 17/18 + Roles (per [README.md](../../README.md) §§2–4):** Create `nuttiew_owner` (`DATABASE_URL`), least-privilege `nuttiew_runtime` (`DATABASE_URL_APP`), install `pgcrypto` + `btree_gist` extensions, run `npm run db:migrate`, apply least-privilege grants, and provision isolated test role `nuttiew_booking_probe` (`DATABASE_URL_BOOKING_PROBE`) plus Sprint 2 runtime/fixture permissions if running the full DB suite locally.
4. **Browser binary (for E2E):** `npx playwright install msedge` (or `npx playwright install --with-deps msedge` on Ubuntu/Linux).

```bash
# A. Offline unit, typecheck, build & container/deploy script checks
npm ci
npm run db:generate
npm test
npm run typecheck
npm run build
python scripts/verify_compose_volume.py
python scripts/verify_container_script_eol.py
bash deploy/tests/run_all_offline.sh

# B. Local disposable PostgreSQL suites (requires isolated .env DB & roles above — NOT a one-shot CI clone)
npm run db:migrate
npm run test:db
node node_modules/vitest/vitest.mjs run apps/api/test/s2.shared-migration.db.test.ts
npm run test:e2e -- --reporter=line,html
```

#### 4.2.2 Hosted GitHub Actions CI-Only Verification ([.github/workflows/ci.yml](../../.github/workflows/ci.yml))

`.github/scripts/test-booking-baseline-upgrade.sh` (`BDF-02`), `.github/scripts/test-s2-lab7-upgrade.sh` (`S2_LAB7_UPGRADE_AND_Q05_90M_PASS`), and `.github/scripts/prepare-test-db.sh` enforce **fail-closed CI-only safety guards** (`CI=true`, `GITHUB_ACTIONS=true`, exact `DATABASE_URL=postgresql://postgres@127.0.0.1:5432/nuttiew_ci`, plus numeric `GITHUB_RUN_ID` / `GITHUB_ENV`). **Do NOT spoof CI environment flags to bypass these guards locally and never edit these scripts to target a real database.** Verify them directly from the hosted GitHub Actions CI workflow runs on each PR/push SHA ([Run `45790031350`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45790031350), [Run `45784163751`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45784163751), and the final merged `main` push CI run).

---

## 5. Final Submission Demo Video Script (`Maximum 4 Minutes`, `NOT YET RECORDED`)

> **Course Standard (`project_final_delivery_v1.pdf` §§2, 3.5, 4.1):** Although §2 mentions "at most 10 minutes", **§3.5 Part E strictly limits the Final submission demo video to `Maximum 4 minutes`** and requires **both students (`@Tanaboonnnnn` and `@Chxtamos`) to appear and present together** (not recorded separately over video conference). Using the stricter **`<= 4:00`** cap satisfies both clauses. Pre-stage test Slots/Bookings beforehand so the `< 4`-minute recording moves cleanly without typing delays or reading secrets aloud. Any longer `8–10 minute` full walkthrough is strictly for **internal rehearsal / UAT dry-run**, NOT for Final submission.
> **§4.1 Delivery Rules:** Upload the final `<= 4:00` video to YouTube (`Unlisted` or `Public` with verified accessibility) and include the YouTube URL + clickable timestamp index below inside the submitted Final PDF.

| Timestamp Index | Segment | Presenters (Both On-Screen Together) | Exact Pre-Staged Live Demo Actions & Spoken Evidence |
|---|---|---|---|
| **`0:00–0:35`** | **Intro, Deployed Version & Scope Boundary** | `@Tanaboonnnnn` & `@Chxtamos` | State deployed Cloud Run URL, exact `main` commit SHA, Sprint 3 release tag, and active Cloud Run revision (`100%` traffic). Briefly clarify acceptance separation: Lab 6 S1 (`nuttiew-00012-nob`) vs. Lab 7 Q05 (`nuttiew-00014-req`) vs. Sprint 2 vs. Final Sprint 3. |
| **`0:35–1:40`** | **Major Journeys (`S1` + `Lab 7 Q05 90m` + `S2`)** | `@Chxtamos` & `@Tanaboonnnnn` | Show pre-staged `Tutor A` `60`-min Slot + `Customer A` booking (`>= 90m` succeeds; `POST` `< 90m` returns `422 BOOKING_NOT_ELIGIBLE`). Walk through Sprint 2 transitions on pre-staged fixtures: Customer cancel (`>= 30m`, atomic reopen), one-time cross-Tutor reschedule to `Tutor B` (`Booking_1` ID preserved, second attempt `409 RESCHEDULE_ALREADY_USED`), Tutor cancel with `OD-014` reason (`Slot` `Withdrawn`) + owning Customer rereading durable notice (`NFR-014`), and unoccupied withdrawal + new Slot ID (`Q32`). |
| **`1:40–2:35`** | **Sprint 3 (`F-S3-01`) Summary & `OD-006`/`OD-009`** | `@Chxtamos` | Show `Tutor A` and `Tutor B` Appointment Summaries under one `meta.evaluatedAt` snapshot: `Upcoming Booked` (`Tutor B` owns `Booking_1`), separate `In-Progress Booked` (`OD-006 Option 1`, status stays `Booked` if timed fixture live, else note automated `SUM-02/09/10`), `Past Booked` (never `Completed`), and `Cancelled` (`Tutor A` `Booking_2`/`Booking_3` without leaking `tutorCancellationReason` or Customer email), with exact `count === list.length`. |
| **`2:35–3:20`** | **Negative Auth, Rule Rejections & Persistence Proof** | `@Tanaboonnnnn` & `@Chxtamos` | Trigger/show `401 LOGIN_FAILED`, `401 UNAUTHENTICATED`, `403 FORBIDDEN` (Customer calling `/api/v1/tutor/summary`), `400 INVALID_INPUT` (`?tutorId=`), `Tutor B` `200 OK` own-only (zero `Tutor A` rows), and `404` foreign read/cancel. Show `FUAT-11` controlled restart/redeploy before/after revision IDs + persisted `Booking`/`Slot`/`Notification` UUIDs on Cloud SQL `nuttiew-pg`. |
| **`3:20–3:55`** | **Limitations, Contributions & AI-Use Disclosure** | Both (`@Tanaboonnnnn` closes) | Disclose team contributions + AI-assisted workflow transparently and summarize known limitations (`OD-008/010/011/012/013/015`, PG15 Lab 7 rollback incompatibility + endorsed recovery policy, Lab 7 live Q05 boundary note, `AUTH-22`). |

---

## 6. Final Report Evidence Map (Instructor Submission Readiness)

> **Privacy Reminder:** Keep both students' official Student IDs strictly inside the final off-repo PDF submitted to LEB2 — **never commit Student IDs, private passwords, or the original course handout PDF to public Git**.

| Final Report Component | Authoritative Repo / Handout Source(s) | Current Status |
|---|---|---|
| **Instructor Final Handout Rules (`<= 4m` joint video, §3.4 restart/redeploy, §4.1 YouTube index)** | `group_project_spec_files.zip/project_final_delivery_v1.pdf` §§2, 3.4, 3.5, 4.1 *(reviewed off-repo; original PDF intentionally uncommitted)*; aligned in §3.1 (`FUAT-11`), §5 & §6 here | **`ALIGNED — VERIFY SUBMISSION SLOT & ANY LATER AMENDMENT BEFORE UPLOAD`** |
| **Whole-Product SRS (`FR-001..036`, `BR-001..035`, `NFR-001..016`, `OD-001..015`)** | [srs.md](../srs.md), [requirements.md](../requirements.md) | **`READY (on sprint3)`** |
| **Feature Inventory & Requirements Traceability** | [features.md](../features.md), [traceability.md](../traceability.md) | **`READY (sync final deployed SHA/tag after PR #175 CD)`** |
| **System Architecture, Concurrency, Migration & Cloud Design** | [system-sds.md](../system-sds.md), [specification.md](../foundations/booking-data/specification.md), [s2-shared-migration-review-notes.md](../sprints/s2-shared-migration-review-notes.md) | **`READY`** |
| **Sprint 1–3 Feature SDS / API / Data / UI / STS Packs** | `docs/features/F-S1-01..05/*`, `docs/features/F-S2-01..05/*`, `docs/features/F-S3-01/*` | **`READY`** |
| **Release Gate & Sprint 1–3 Integration Evidence** | [sprint2-integration-release-evidence.md](../sprints/sprint2-integration-release-evidence.md), [sprint3-release-gate-evidence.md](../sprints/sprint3-release-gate-evidence.md), [final-delivery-handoff.md](final-delivery-handoff.md) | **`UPDATE POST-G2 & POST-S3 DEPLOY`** |
| **Automated CI / Test Output Summary (`348/348`)** | §4 above + [PR #175 CI `45784163751`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45784163751) (re-capture on merged `main` SHA) | **`RE-CAPTURE ON MERGED main SHA`** |
| **Live 3-Sprint Final UAT, Controlled Restart Persistence & Independent Acceptance Log** | §§3.1–3.2 above (`FUAT-01`–`FUAT-12`) | **`NOT RUN (pending G2 + S3 deploy)`** |
| **Two-Student Joint Demo Video (`<= 4m`) & YouTube Timestamp Index** | §5 above + §3 of [final-delivery-handoff.md](final-delivery-handoff.md) | **`SCRIPT READY — VIDEO NOT YET RECORDED`** |
| **Team Contributions, Honest AI-Use & Known Limitations** | §§5–6 of [final-delivery-handoff.md](final-delivery-handoff.md) | **`READY (verify final PR range after release)`** |
| **LEB2 Submission Receipt** | §7 of [final-delivery-handoff.md](final-delivery-handoff.md) + [plan.md](../sprints/plan.md) (`13 Dec 2026` target) | **`NOT DONE`** |
