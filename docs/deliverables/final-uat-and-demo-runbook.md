# CPE334 NutTiew — Final UAT Checklist, Regression Matrix & Two-Student Demo Runbook (Issue #150 / S3-06)

> **STATUS: `PREPARED — NOT EXECUTED ON SPRINT 3 LIVE REVISION YET` (Prepared 26 Nov 2026 ICT on `origin/sprint3@079de311ea2a87fcb61bd6d258d33f1e15637a23`).**
> **Honesty Guardrail:** This runbook defines the post-release verification checklist, synthetic test-account protocol, automated regression matrix, cue-by-cue two-student demo script, and Final Report evidence map for [Issue #150](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/150) (`OPEN`). Preparing this runbook does **not** satisfy Gate `G2`, does **not** execute live Sprint 3 tests, does **not** merge [PR #175](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/175), and does **not** assert completion of any screenshot, demo video, Final PDF, or LEB2 submission.

---

## 1. Pre-Execution Release Gate & Environment Checklist

Execute §3 (`FUAT-01`–`FUAT-12`) and §5 (Demo Video) **only after all preconditions below are verified**:

| Gate # | Required Precondition | Verification Method | Current Status |
|---|---|---|---|
| **PRE-01** | Gate `G2` closed by `@Tanaboonnnnn`: Sprint 2 live authenticated check (`C-05`), persistence/authorization proof, annotated S2 tag on `main@d3eaf11`, and team-endorsed forward-recovery decision for the known PG15 Lab 7 rollback incompatibility | Check [sprint3-release-gate-evidence.md](../sprints/sprint3-release-gate-evidence.md) & Issue `#120` | **`PENDING` (`G2 BLOCKED`)** |
| **PRE-02** | [PR #175](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/175) (`sprint3 -> main`) reviewed/approved after `G2` closure, merged to `main`, and `main` push `NutTiew CI` passes `3/3` on the exact merged `main` SHA | `gh pr view 175` + `gh run list --branch main` | **`PENDING` (`PR #175 OPEN`)** |
| **PRE-03** | Explicit release authorization: `DEPLOY_ENABLED="true"`, `.github/workflows/deploy.yml` dispatched on exact merged `main` SHA (`demo` environment approved), migration job + Cloud Run revision at `100%` traffic + matching digest, `DEPLOY_ENABLED="false"` restored immediately after | [deploy.yml](../../.github/workflows/deploy.yml) + repository vars + Cloud Run check | **`PENDING`** |
| **PRE-04** | Annotated Sprint 3 release tag created on the verified `main` SHA | `git fetch origin --tags && git tag -n9` | **`PENDING`** |
| **PRE-05** | Clean target origin verified before UAT session: `https://nuttiew-nxe2keefba-as.a.run.app` (`/api/ready` HTTP `200`) | `GET /api/ready` + deployed revision check | **`PENDING S3 DEPLOY`** |

---

## 2. Synthetic Test Accounts & Non-Destructive Data Rules (No Secrets in Git)

### 2.1 Existing Role-Labelled Synthetic Accounts (Cloud SQL `nuttiew-pg`)

Per [uat-cases-and-handoff.md](../labs/lab-06/uat-cases-and-handoff.md) §1.2, four role-labelled synthetic accounts already exist in Cloud SQL `nuttiew-pg`. **Passwords and private credentials are exchanged strictly through the private team channel — never commit passwords, session cookies, CSRF tokens, or real Student IDs into Git, PRs, screenshots, or the Final PDF.**

| Account Label | Role | Identifier / Public Suffix Reference | Purpose in Final Live UAT & Demo |
|---|---|---|---|
| `Tutor A (Primary)` | `Tutor` | `tutor.demo@example.test` (UI suffix `#1cb1d623`, `TUTOR-0a340de8`) | Create future Slots (`Q03/Q06`), Tutor cancellation with `OD-014`, unoccupied Slot withdrawal (`Q27/Q32`), and primary Tutor 4-bucket Summary (`FUAT-08`) |
| `Tutor B (Secondary)` | `Tutor` | Shared privately via team channel (`Tutor` role) | Cross-Tutor reschedule destination (`Q12` in `FUAT-05`), cross-Tutor summary isolation (`200 OK` own-only, zero Tutor A rows), and foreign Tutor cancel denial (`404 BOOKING_NOT_FOUND`) |
| `Customer A (Primary)` | `Customer` | `customer.demo@example.test` (UI suffix `#2a4a7fc5`) | Browse offers, valid booking (`>= 90m`), `< 90m` cutoff failure (`422`), Customer cancel (`>= 30m`), one-time reschedule (`>= 60m`), reread durable Tutor notice (`NFR-014`), and Customer `403` on Tutor summary |
| `Customer B (Secondary)` | `Customer` | Shared privately via team channel (`Customer` role) | Occupied-Slot `409` check, foreign Booking/Notification `404` checks, and isolation verification (zero `Customer A` records or `OD-014` reason leaked) |

### 2.2 Reproducible Local/Disposable Seed Interface (`apps/api/prisma/seed.ts`)

For local or disposable PostgreSQL verification (never against production with guessed/reset commands):
- [apps/api/prisma/seed.ts](../../apps/api/prisma/seed.ts) accepts `SEED_EMAIL`, `SEED_PASSWORD` (minimum 12 UTF-8 bytes), and `SEED_ROLE=Customer|Tutor` via environment variables (`npm run db:seed`), using `argon2id` and `ON CONFLICT("email") DO NOTHING`.

### 2.3 Non-Destructive Production DB Rules for Live UAT

1. **Never reset or delete production rows:** `prisma migrate reset`, `TRUNCATE`, and `DELETE` against Cloud SQL `nuttiew-pg` are strictly prohibited. Remember PITR is not enabled on `nuttiew-pg`.
2. **Use unique future `Asia/Bangkok` dates:** Avoid previously used test dates (`2026-12-09` from Lab 5, `2026-12-20`/`2026-12-21` from Lab 6, and dates used in Sprint 2 `C-05`/UAT). Recommended fresh date block for Final S3 UAT (if > 14 days from run date): e.g., **`2026-12-26`**, **`2026-12-27`**, **`2026-12-28`** (adjust cleanly to unambiguous unused future dates on execution day, plus a controlled near-cutoff future slot on the same Bangkok calendar day for the `< 90m` `Q05` live check where safe).
3. **Role hygiene:** Always click **ออกจากระบบ** (`Sign Out`) or use an isolated browser context between role switches (`Tutor A`, `Tutor B`, `Customer A`, `Customer B`).
4. **Private fixture ledger:** Record created `Slot` UUIDs, `Booking` UUIDs, and timestamps locally during testing so persistence checks (`FUAT-11`) match exact IDs after reload/re-login.

---

## 3. Executable 3-Sprint Final Live UAT Checklist (`FUAT-01`–`FUAT-12`)

> Save sanitized screenshots (no passwords, no `Cookie`/`Set-Cookie` headers, no raw secrets) under `docs/deliverables/evidence/final-s3-<YYYY-MM-DD>/` only **after** authorized Sprint 3 deployment. All cases below are **`NOT RUN`** until live execution.

| ID | Sprint / Scope | Requirements & Contracts | Test Steps on Live Deployed Sprint 3 App | Expected Observable Outcome | Planned Screenshot Artifact | Current Status |
|---|---|---|---|---|---|---|
| **`FUAT-01`** | **S1 Auth + Lab 6 `#139`/`#140`** | `F-S1-01`; `FR-001..004`; `NFR-001/002/015`; `AC-S1-01..05` | Sign in with wrong password (`Customer A`); send malformed/NUL-byte email check (`RT-04` safe check); sign in with `Customer A`; click **ออกจากระบบ** and call protected route/reload | Wrong password → `401 UNAUTHENTICATED`; NUL-byte email → `400 INVALID_INPUT` (no `503`); valid login loads own role workspace; post-logout access fails `401` | `FUAT-01-auth-guard.png` | **`NOT RUN`** |
| **`FUAT-02`** | **S1 Tutor Explicit Slots** | `F-S1-02`; `Q03/Q04/Q06`; `FR-005..007`; `BR-003/004/006`; `AC-S1-08..12` | As `Tutor A`, create `Slot_A1` (`13:00–14:00` on `Date_1`), try overlapping `13:30–14:30`, create adjacent `Slot_A2` (`14:00–15:00`), and try yesterday in `Asia/Bangkok` | `Slot_A1` created as exact `60`-min offer; overlap `13:30–14:30` rejected (`409`) leaving `Slot_A1` intact; adjacent `Slot_A2` accepted; past date rejected (`422`) | `FUAT-02-tutor-slots.png` | **`NOT RUN`** |
| **`FUAT-03`** | **S1 Discovery, Booking & Lab 7 `CR-L7-01` (`90m`)** | `F-S1-03/04/05`; `Q01/Q05/Q28`; `BR-001/005/028`; `CR-L7-01`; `AC-S1-15/19/20/21/23` | As `Customer A`, verify `Slot_A1` visible without other Customer PII and book (`>= 90m` -> `Booking_1`); attempt booking a Slot with start `< 90m` from server time; have `Tutor B` offer `13:00–14:00` on `Date_1` and attempt cross-Tutor overlapping booking as `Customer A` | Valid `>= 90m` booking commits (`201`, status `Booked`, pseudonymous `CUST-...` on `Tutor A`, `TUTOR-...` on `Customer A`); `< 90m` rejected `422 BOOKING_NOT_ELIGIBLE`; cross-Tutor overlap rejected `409 CUSTOMER_OVERLAP` | `FUAT-03-s1-q05-booking.png` | **`NOT RUN`** |
| **`FUAT-04`** | **S2 Customer Cancel & Atomic Reopen** | `F-S2-01`; `Q07/Q08`; `FR-020/021`; `BR-007/008` | Create `Slot_A3` (`Date_1 16:00–17:00`) -> `Customer A` books (`Booking_2`); cancel `Booking_2` as `Customer A` (`>= 30m` before start) | `Booking_2` updates to `Cancelled` (`cancellationActor: Customer`, `cancellationReason: null`); `Slot_A3` atomically returns to available offers (still governed by `Q05 = 90m` for new bookings) | `FUAT-04-customer-cancel.png` | **`NOT RUN`** |
| **`FUAT-05`** | **S2 Cross-Tutor One-Time Reschedule** | `F-S2-02`; `Q09..Q16`; `FR-022..027`; `BR-009..016` | Have `Tutor B` create `Slot_B1` (`Date_2 10:00–11:00`) and `Slot_B2` (`Date_2 15:00–16:00`); reschedule `Booking_1` (`Customer A`, `>= 60m`) from `Slot_A1` (`Tutor A`) to `Slot_B1` (`Tutor B`), then attempt a second reschedule to `Slot_B2` | First reschedule succeeds preserving exact `Booking_1` UUID, reopening `Slot_A1`, occupying `Slot_B1`, recording reschedule history; second reschedule is rejected (`409`) leaving `Slot_B1` intact | `FUAT-05-reschedule-once.png` | **`NOT RUN`** |
| **`FUAT-06`** | **S2 Tutor Cancel (`OD-014`) & Durable Notice** | `F-S2-03/04`; `Q17..Q25`; `OD-014`; `NFR-014` | Book `Slot_A2` (`Tutor A`, `>= 60m`) as `Customer A` (`Booking_3`); as `Tutor A`, try blank/whitespace/symbol-only reason (`...`), then cancel with valid reason containing letters; sign in as `Customer A`, open notice + cancelled detail, reload/re-open notice | Blank/symbol-only reason rejected (`400 INVALID_INPUT`); valid reason cancels `Booking_3` & **withdraws** `Slot_A2` (`Withdrawn`, not reoffered); `Customer A` sees exact reason in both durable notice and detail, rereadable after marking read | `FUAT-06-tutor-cancel-notice.png` | **`NOT RUN`** |
| **`FUAT-07`** | **S2 Unoccupied Slot Withdrawal & Replacement** | `F-S2-05`; `Q26/Q27/Q32`; `FR-033/034`; `BR-026/027/032` | As `Tutor B`, try withdrawing occupied `Slot_B1` (`Booking_1`); withdraw unoccupied `Slot_B2` (`Date_2 15:00–16:00`); create a new replacement Slot `Slot_B3` on `Date_2 15:00–16:00` | Occupied `Slot_B1` withdrawal rejected (`409`); unoccupied `Slot_B2` transitions to `Withdrawn` (history kept); `Slot_B3` succeeds under a **brand-new UUID** without reactivating `Slot_B2` | `FUAT-07-slot-withdraw-newid.png` | **`NOT RUN`** |
| **`FUAT-08`** | **S3 Tutor Appointment Summary (`OD-006`/`OD-009`)** | `F-S3-01`; `Q30/Q31`; `FR-035`; `BR-030/031`; `NFR-016` | Inspect `Tutor A` and `Tutor B` Summary workspaces (`GET /api/v1/tutor/summary`): verify `Upcoming Booked`, `In-Progress Booked` (`OD-006 Option 1`, status stays `Booked`), `Past Booked` (preexisting past `Booked` rows, never `Completed`), and `Cancelled` (`Customer` + `Tutor` actors, omitting `tutorCancellationReason` & Customer email) under one `meta.evaluatedAt` | Every category count equals its rendered list length (`count === list.length`); `Tutor A` sees `Booking_2` (`Customer`) + `Booking_3` (`Tutor`) in Cancelled without exposing cancellation reason/email; `Tutor B` sees `Booking_1` in Upcoming Booked; note honestly whether live `In-Progress` bucket had a timed fixture or relied on automated `SUM-02/09/10` | `FUAT-08-tutor-summary-4buckets.png` | **`NOT RUN`** |
| **`FUAT-09`** | **Negative Authorization & Privacy Matrix** | `F-S1-01/05`, `F-S2-01..04`, `F-S3-01`; `NFR-001/007/015`; `SUM-03/05/09` | Verify via browser/DevTools/`curl` on live URL: `/api/v1/tutor/summary` as anonymous (`401`), `Customer A` (`403`), `Tutor B` (`200` own-only, zero `Tutor A` rows), `?tutorId=<other>` (`400 INVALID_INPUT`); foreign `Customer B` lookup on `Customer A`'s `Booking_1` & notification ID (`404`); cross-role endpoints (`403`); `Tutor A` cancel attempt on `Booking_1` assigned to `Tutor B` (`404 BOOKING_NOT_FOUND`) | Exact status codes & zero private identity/reason/SQL/stack leaks across all negative probes (`F-S3-01` API §3, `F-S1-05` §2.2, `F-S2-04` §3) | `FUAT-09-negative-auth.png` | **`NOT RUN`** |
| **`FUAT-10`** | **Non-Bangkok Browser Timezone Fidelity** | `SYS-01`; `Q29`; `BR-029`; `NFR-006`; `AC-S1-14/18`; `SUM-08/10` | Launch browser with timezone overridden to `America/Los_Angeles` (or `UTC`), open `Tutor B` Summary & `Customer A` Bookings | All appointment dates/hours still display intended `Asia/Bangkok` calendar dates and times matching Bangkok session results | `FUAT-10-timezone-bangkok.png` | **`NOT RUN`** |
| **`FUAT-11`** | **Hard Reload, Re-Login & Preexisting Data Persistence** | `SYS-01`; `FR-016/019`; `NFR-003`; `SUM-07` | Hard-reload browser, sign out, sign back in with fresh session, check preexisting historical records (`Lab 5`/`Lab 6`/`S2`) alongside newly created `FUAT-01..08` records, and confirm live Cloud Run revision stays Ready on `nuttiew-pg` | Preexisting records and all new `Booking`/`Slot`/`Notification`/Summary counts & rows persist identically across refresh and new session | `FUAT-11-persistence-reload.png` | **`NOT RUN`** |
| **`FUAT-12`** | **Release Integrity & Final Tag Audit** | `NFR-011/012/013`; Issue `#149` AC #3–#4; Issue `#150` AC #1 | Verify merged `main` SHA, `NutTiew CI` `3/3`, `NutTiew CD` `3/3`, Cloud Run revision (`100%` traffic + matching container digest), `DEPLOY_ENABLED="false"`, and annotated Sprint 3 Git tag | Exact commit SHA, CI/CD run URLs, revision ID, digest, `DEPLOY_ENABLED="false"`, and Sprint 3 tag match `sprint3-release-gate-evidence.md` & `final-delivery-handoff.md` | `FUAT-12-cloud-run-release.png` | **`NOT RUN`** |

---

## 4. Automated Regression Verification Matrix & Reproducible Commands

### 4.1 Latest Verified Hosted CI Baseline (`sprint3@079de311ea2a87fcb61bd6d258d33f1e15637a23`)

Verified across both [PR #175 CI Run `45784163751`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45784163751) and [`sprint3` Push CI Run `45784152146`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45784152146) (identical code/test state as `b9b336d` `348/348` breakdown):

| CI Job (`.github/workflows/ci.yml`) | Covered Suites & Verification Gates | Verified Result on `079de31` |
|---|---|---|
| **`Unit / types / build`** | `npm run db:generate`, `npm test` (`@nuttiew/api` 6 unit files + `@nuttiew/web` 2 unit files), `npm run typecheck`, `npm run build`, `docker build --target runtime`, `docker compose config --quiet`, `verify_compose_volume.py`, `verify_container_script_eol.py`, `bash deploy/tests/run_all_offline.sh` | **`SUCCESS`** (Jobs `139786628266`, `139786592473`) |
| **`PostgreSQL 18 / Auth / Slot / Race A`** | All 7 forward-only Prisma migrations, `test-booking-baseline-upgrade.sh` (`BDF-02`), `test-s2-lab7-upgrade.sh` (`S2_LAB7_UPGRADE_AND_Q05_90M_PASS`), `prepare-test-db.sh` (least-privilege runtime role), `npm run test:db` (20 DB integration/concurrency/restart files covering S1 Auth/Slots/Availability/Bookings/Retrieval, S2 Cancel/Reschedule/Notifications/Withdrawal, and S3 Summary `SUM-01..07/09`), plus `apps/api/test/s2.shared-migration.db.test.ts` | **`SUCCESS`** (Jobs `139786628560`, `139786592934`) |
| **`Microsoft Edge / Auth / Tutor UI E2E`** | Non-owner runtime DB role + `npx playwright install --with-deps msedge` + `npm run test:e2e -- --reporter=line,html` across all Playwright UI/E2E specs including `e2e/summary.spec.ts` (`SUM-08`, `SUM-08b`, `SUM-10`) | **`SUCCESS`** (Jobs `139786628708`, `139786592965`) |

> **Note on `AUTH-22` & PG15:** `apps/api/test/auth.barrier.db.test.ts` passed on `079de31`, `b9b336d`, and `8187bc4` after a single observed failure (`expected 13 to be 5`) on PR `#173` Run `45644905166` Attempt 1 (suspected IP-bucket collision in `192.0.2.1`–`192.0.2.240`, root cause unproven). Full E2E was executed on hosted PostgreSQL 18; hosted Cloud SQL is PostgreSQL 15.19 (local PG 15.17 migration + transition rehearsal verified in `#120` checkpoint without rerunning full E2E on PG 15).

### 4.2 Exact Commands for Pre-/Post-Release Re-Verification (From Repo Root)

Per [package.json](../../package.json), [apps/api/package.json](../../apps/api/package.json), and [.github/workflows/ci.yml](../../.github/workflows/ci.yml) (against a **disposable** local PostgreSQL DB only — never production):

```bash
# 1. Offline unit, typecheck & production build
npm ci
npm run db:generate
npm test
npm run typecheck
npm run build

# 2. Offline deployment/container checks
python scripts/verify_compose_volume.py
python scripts/verify_container_script_eol.py
bash deploy/tests/run_all_offline.sh

# 3. Real PostgreSQL integration, upgrade & concurrency tests (disposable DB only)
# Requires DATABASE_URL, AUTH_CANONICAL_ORIGIN=http://localhost:5173, AUTH_CSRF_HMAC_KEY, AUTH_RATE_KEY
npm run db:migrate
bash .github/scripts/test-booking-baseline-upgrade.sh
bash .github/scripts/test-s2-lab7-upgrade.sh
bash .github/scripts/prepare-test-db.sh
npm run test:db
node node_modules/vitest/vitest.mjs run apps/api/test/s2.shared-migration.db.test.ts

# 4. Microsoft Edge Playwright UI E2E (disposable DB only)
npm run test:e2e -- --reporter=line,html
```

---

## 5. Cue-by-Cue Two-Student Demo Video Script (`NOT YET RECORDED`, ~8–10 min)

> **Recording Precondition:** Record only **after** `sprint3 -> main` deployment completes and `FUAT-01`–`FUAT-12` have verified real live behavior on `https://nuttiew-nxe2keefba-as.a.run.app`. Both `@Tanaboonnnnn` (Student 1 / Customer & Repo Owner) and `@Chxtamos` (Student 2 / Tutor & Documentation/Release Lead) must actively present on camera/voice. Do **not** read private passwords aloud or show raw `Cookie`/secret headers on screen.

| Time | Segment | Lead Speaker & Screen | Exact Actions & Spoken Points |
|---|---|---|---|
| **0:00–1:00** | **1. Intro, Deployed Version & Scope Boundary** | Both (`@Tanaboonnnnn` opens, `@Chxtamos` adds acceptance scope) | Show GitHub `main` SHA, Sprint 3 release tag, Cloud Run revision at `100%` traffic, and live URL. Explicitly separate **Lab 6 Sprint 1 UAT (`nuttiew-00012-nob`)**, **Lab 7 Q05 `90m` (`nuttiew-00014-req`)**, **Sprint 2 (`nuttiew-00016-haw`)**, and **Final Sprint 3 release**. State team role split and transparent AI-assisted tooling scope. |
| **1:00–3:00** | **2. Sprint 1 + Lab 7 `CR-L7-01` (`90m`)** | `@Chxtamos` (`Tutor A`), then `@Tanaboonnnnn` (`Customer A`) | Show invalid login rejection (`401`), `Tutor A` creating a `60`-min Slot (`Q03`), overlap rejection (`409` `Q06`), and adjacent Slot success (`FUAT-02`). `@Tanaboonnnnn` signs in as `Customer A`, shows available offers with zero third-party Customer leaks, proves `< 90m` booking rejection (`422 BOOKING_NOT_ELIGIBLE`) and `>= 90m` booking success (`FUAT-03`), plus `CUST-...` pseudonymous ID on Tutor view. |
| **3:00–5:30** | **3. Sprint 2 (`F-S2-01..05`) Full Lifecycle** | `@Tanaboonnnnn` (`Customer A`), `@Chxtamos` (`Tutor A` & `Tutor B`) | Demonstrate: (a) Customer cancel (`>= 30m`, `Q07`) reopening original Slot (`FUAT-04`); (b) Customer one-time cross-Tutor reschedule (`>= 60m`, `Q10/Q11/Q12`) keeping the same Booking ID and blocking a second reschedule (`FUAT-05`); (c) `Tutor A` cancellation rejecting blank/filler reason and requiring `OD-014` letter reason (`>= 60m`), withdrawing the Slot, and `Customer A` rereading the persistent notice (`NFR-014`, `FUAT-06`); (d) unoccupied Slot withdrawal + replacement under a **new Slot ID** (`Q32`, `FUAT-07`). |
| **5:30–7:15** | **4. Sprint 3 (`F-S3-01`) Summary & `OD-006`/`OD-009`** | `@Chxtamos` (`Tutor A` / `Tutor B`) | Show the 4-bucket Tutor Appointment Summary (`Upcoming Booked`, separate `In-Progress Booked` keeping status `Booked` per adopted `OD-006 Option 1`, `Past Booked` derived without `Completed`, and `Cancelled` showing Customer & Tutor actors without leaking `tutorCancellationReason` or Customer email) under one single-statement `meta.evaluatedAt` snapshot (`count === list.length`). |
| **7:15–8:45** | **5. Negative Auth, Timezone & Persistence** | Both (screen + terminal/DevTools) | Show anonymous `401`, Customer `403`, Tutor B `200` own-only summary (`0`/empty, zero Tutor A leak), `?tutorId=` `400`, foreign Booking/Notification `404` (`FUAT-09`), non-Bangkok browser timezone check (`FUAT-10`), and hard reload + fresh login persistence (`FUAT-11`). |
| **8:45–9:30** | **6. Known Limitations & Closing** | Both (`@Tanaboonnnnn` closes) | Honestly summarize open decisions (`OD-008/010/011/012/013/015`), PG15 Lab 7 rollback incompatibility (forward recovery policy), Lab 7 live Q05 note vs automated proof, and `AUTH-22` intermittent observation. |

---

## 6. Final Report Evidence Map (Instructor Submission Readiness)

> **Privacy Reminder:** Keep both students' official Student IDs strictly inside the final off-repo PDF submitted to LEB2 — **never commit Student IDs or real credentials to public Git**. Always verify the actual instructor Final handout (rubric, sections, file naming, deadline target `13 Dec 2026`) before generating the Final PDF.

| Final Report Component | Authoritative Repo Source(s) | Current Status |
|---|---|---|
| **Whole-Product SRS (`FR-001..036`, `BR-001..035`, `NFR-001..016`, `OD-001..015`)** | [srs.md](../srs.md), [requirements.md](../requirements.md) | **`READY (on sprint3)`** |
| **Feature Inventory & Requirements Traceability** | [features.md](../features.md), [traceability.md](../traceability.md) | **`READY (sync final deployed SHA/tag after PR #175 CD)`** |
| **System Architecture, Concurrency, Migration & Cloud Design** | [system-sds.md](../system-sds.md), [docs/foundations/booking-data/specification.md](../foundations/booking-data/specification.md), [s2-shared-migration-review-notes.md](../sprints/s2-shared-migration-review-notes.md) | **`READY`** |
| **Sprint 1–3 Feature SDS / API / Data / UI / STS Packs** | `docs/features/F-S1-01..05/*`, `docs/features/F-S2-01..05/*`, `docs/features/F-S3-01/*` | **`READY`** |
| **Release Gate & Sprint 1–3 Integration Evidence** | [sprint2-integration-release-evidence.md](../sprints/sprint2-integration-release-evidence.md), [sprint3-release-gate-evidence.md](../sprints/sprint3-release-gate-evidence.md), [final-delivery-handoff.md](final-delivery-handoff.md) | **`UPDATE POST-G2 & POST-S3 DEPLOY`** |
| **Automated CI / Test Output Summary (`348/348`)** | §4 above + [PR #175 CI `45784163751`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45784163751) (re-capture on merged `main` SHA) | **`RE-CAPTURE ON MERGED main SHA`** |
| **Live 3-Sprint Final UAT & Persistence Screenshots** | §3 above (`FUAT-01`–`FUAT-12`) | **`NOT RUN (pending S3 deploy)`** |
| **Two-Student Demo Video & Script** | §5 above + §3 of [final-delivery-handoff.md](final-delivery-handoff.md) | **`SCRIPT READY — VIDEO NOT YET RECORDED`** |
| **Team Contributions, Honest AI-Use & Known Limitations** | §§5–6 of [final-delivery-handoff.md](final-delivery-handoff.md) | **`READY (verify final PR range after release)`** |
| **Instructor Final Handout & LEB2 Submission Receipt** | §7 of [final-delivery-handoff.md](final-delivery-handoff.md) + [plan.md](../sprints/plan.md) | **`HANDOUT PENDING / LEB2 NOT DONE`** |
