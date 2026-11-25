# Lab 7 Part D — Release Readiness, Retrospective & Submission Index (`L7-04` / Issue #125)

> **Readiness Verdict (25 Nov 2026 02:40 ICT — Maintained Sprint 1 Scope Only):**
> - **Staging → `sprint1 -> main` Release PR:** **`READY`** (`sprint1@a845f56` passes `221/221` app tests + `158/158` GH-05 deploy checks, `0` Critical/Major defects, reviewed `CR-L7-01` contract/code/metrics complete).
> - **Final Deployed Release & LEB2 Submission Sign-Off:** **`NOT READY`** until the 4 remaining release/submission gates in §1.6 complete: (1) human-reviewed `sprint1 -> main` release PR + annotated Git tag, (2) authorized Lab 5 CD deployment to Cloud Run (`deploy.yml`), (3) live post-deploy smoke checks proving the new 90-minute Q05 cutoff + preserved Sprint 1 flow, and (4) closing `#139`, refreshing [metrics-124.md](metrics-124.md) with final release/deploy evidence, assembling the local controlled PDF with both students' names/IDs, and uploading to LEB2 by **29 Nov 2026, 23:59 ICT**.
>
> **Scope & Privacy Boundaries:** Covers **maintained Sprint 1 (`F-S1-01`..`F-S1-05`) + `CR-L7-01` only**. Sprint 2 and Sprint 3 implementation is explicitly excluded from this release (`git diff f94dce99..a845f563` touches 22 files strictly limited to Lab 6 submission index and Lab 7 Part A–C artifacts). Personal Student IDs, passwords, tokens, session cookies, and private keys are **excluded from public Git**; Student IDs appear only in the locally generated, untracked LEB2 submission PDF (`Lab7_CPE334_NutTiew_Parts_A_D.pdf`).

- **Repository / Product:** [Tanaboonnnnn/CPE334-NutTiew](https://github.com/Tanaboonnnnn/CPE334-NutTiew) (CPE334 NutTiew Tutoring Appointment System — Theme 1: Appointment & Scheduling)
- **Issue:** [#125 (`[Lab 7][L7-04]`)](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/125) | **Completed Prerequisites:** [#122](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/122) (PR `#162`, `CLOSED`), [#123](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/123) (PR `#163`, `CLOSED`), [#124](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/124) (PR `#164`, `CLOSED`)
- **Team:** NutTiew (`@Tanaboonnnnn`, `@Chxtamos`)
- **Governance Note (25 Nov 2026):** Per the updated in-class instruction reported by the team on 25 Nov 2026 (recorded in `#122`–`#125`), no separate external instructor/TA approval artifact is required for `CR-L7-01`; independent teammate contract/PR review, required CI, and release/CD gates remain mandatory.

---

## 1. Release Readiness Checklist (Maintained Sprint 1 Scope)

### 1.1 Baseline, Version Lineage & `CR-L7-01` Change Summary

- **Old vs New `CR-L7-01` Rule (Q05 — New Customer Booking & Bookable Availability Cutoff):**
  - **Accepted Lab 6 Sprint 1 behavior:** `slot.startsAt - serverTime >= 60 minutes` (`60:00` eligible / `59:59` rejected with HTTP `422 BOOKING_NOT_ELIGIBLE`).
  - **Maintained Lab 7 Sprint 1 behavior:** `slot.startsAt - serverTime >= 90 minutes` (`5,400` seconds; `90:00` eligible / `89:59` and `89:59.999999` rejected with HTTP `422 BOOKING_NOT_ELIGIBLE`), enforced consistently on Customer availability (`T_view` in `apps/api/src/availability.ts`) and post-lock DB `INSERT` (`T_elig = clock_timestamp()` in `booking_guard_s1()` via forward migration `20261125000000_lab7_q05_min_notice`).
  - **Preserved invariants:** Existing Bookings, natural-key replay, 60-minute Slot duration (Q03), 60-day browse horizon, Customer/Tutor roles, session/CSRF/origin checks, `AUTH-NUL-01` (`#139`), lock order, and later-sprint cutoffs (Q07 30 min; Q10/Q11/Q18 60 min) are unchanged.

| Evidence ID | Stage | Branch / PR | Exact Commit SHA (Tag) | CI / CD & Review Evidence | Status & Legitimate Merge-SHA Note |
|---|---|---|---|---|---|
| `EV-L7-01` | **Accepted Lab 6 Sprint 1 Baseline** | `main` ([PR `#142`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/142)) | `f94dce99af198b225aafb54bfbf46da420836f35` *(no Git tag on `origin`)* | [CI `45204901005`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45204901005) (3/3 PASS); [CD `45212589215`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45212589215) (`nuttiew-00012-nob`, `sha256:851b688a...38673a`); Partner `PEW-DIY` Accepted ([`#110`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/110#issuecomment-7110865094)) | **VERIFIED BASELINE** — currently live at `https://nuttiew-nxe2keefba-as.a.run.app/` (old 60-min Q05 rule). |
| `EV-L7-02` | **Actual Pre-Change `sprint1`** | `sprint1` ([PR `#152`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/152)) | `c2213df7669abf65596d1c1d61265db4c09eabfa` | [CI `45359605097`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45359605097) (3/3 PASS) | **VERIFIED** — differs from `main@f94dce99` only by `docs/labs/lab-06/lab6-submission-index.md` (zero runtime diff). |
| `EV-L7-03` | **Lab 7 Part A Contract (`#122`)** | `docs/122-lab7-cr-l7-01` → `sprint1` ([PR `#162`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/162)) | Head `ed35b4b2be8ff988e63e3e6e030acc39571f366b` → Merge `61df88855ebce97e41367a0de966e4537a72dbf6` | `@Chxtamos` RC on `2bafd707` → Approved `ed35b4b2` (`2026-11-25 01:20 ICT`); push [CI `45458467458`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45458467458) (3/3 PASS) | **MERGED & CLOSED** — reviewed contract before first implementation commit. Merge SHA differs from reviewed head because `sprint1` uses non-fast-forward merge commits. |
| `EV-L7-04` | **Lab 7 Part B TDD RED / GREEN (`#123`)** | `fix/123-lab7-q05-90-min` → `sprint1` ([PR `#163`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/163)) | RED `fc493af8` → GREEN `1d02e777` → Head `a410a30b` → Merge `02672d4b475dc15018e182467c0468c4f63accf4` | `@Chxtamos` Approved `a410a30b` (`2026-11-25 01:48 ICT`); PR [CI `45461841734`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45461841734) & push [CI `45464164774`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45464164774) (3/3 PASS) | **MERGED & CLOSED** — minimum scoped change (`availability.ts` + forward migration `20261125000000_lab7_q05_min_notice`). |
| `EV-L7-05` | **Lab 7 Part C Metrics (`#124`)** | `docs/124-lab7-metrics` → `sprint1` ([PR `#164`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/164)) | Head `c38f7538c689f59425baf8c5d6d60b6434ef1a5d` → Merge `a845f563e3c125ddeaaa210421cb69bd70b277c7` | `@Tanaboonnnnn` RC on `fecae3ed` → Approved `c38f7538` (`2026-11-25 02:28 ICT`); PR [CI `45468467660`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45468467660) & push [CI `45471154386`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45471154386) (3/3 PASS) | **MERGED & CLOSED** — pre-release snapshot at `2026-11-25 01:56 ICT`; refresh after `sprint1 -> main` release & deploy. |
| `EV-L7-06` | **Lab 7 Part D Readiness & Index (`#125`)** | `docs/125-lab7-final-evidence` → `sprint1` ([PR `#165`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/165)) | Branched from `origin/sprint1@a845f563`; initial head `48b45171` + RC fix commit *(this PR)* | Head `48b45171` passed [CI `45472590584`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45472590584) (3/3 PASS); AI-assisted RC (`PRR_kwDOVg8MSM8AAAABaGNzBQ`) addressed in current fix commit (CI re-running on updated head; **actual human teammate review (`@Tanaboonnnnn`) pending**) | **IN PR REVIEW** — docs-only PR; CI verified on `48b45171`, re-running on fix commit, awaiting human teammate review. `#125` stays `OPEN` until release, deploy, smoke, and LEB2 PDF upload complete. |
| `EV-L7-07` | **Lab 7 `sprint1 -> main` Release & Tag** | `sprint1` → `main` | **PENDING / NOT RUN** *(planned annotated tag on `main` merge SHA, e.g. `lab7-s1-q05-90m`)* | **NOT RUN** — requires separate human-reviewed `sprint1 -> main` PR + green `main` CI | **BLOCKING FINAL SIGN-OFF** — `origin/main` is still `f94dce99`. |
| `EV-L7-08` | **Lab 7 Cloud Run Deploy & Live Smoke** | `main` (`workflow_dispatch` `deploy.yml`) | **PENDING / NOT RUN** *(currently serving Lab 6 `nuttiew-00012-nob`)* | **NOT RUN** — requires authorized `DEPLOY_ENABLED=true`, `demo` env approval, and post-deploy smoke on 90-min Q05 | **BLOCKING FINAL SIGN-OFF** — Lab 6 smoke evidence does NOT prove Lab 7 live behavior. |

- **Later-Sprint Exclusion Proof:** `sprint2` and `sprint3` branches were never merged into `sprint1` or used as a Lab 7 base. Their separate reconciliation is tracked outside Lab 7 (see §2).

### 1.2 Defects by Severity, Status & Independent Sprint 1 UAT Acceptance

| Severity / Category | Count | Finding / Issue ID | Status as of `2026-11-25 02:40 ICT` | Evidence & Caveats |
|---|---:|---|---|---|
| **Critical** | `0` | — | None open or reported | Verified across Lab 6 UAT (`#106`, `#107`, `#110`) and Lab 7 CI (`45464164774`, `45471154386`). |
| **Major** | `0` | — | None open or reported | Same basis. |
| **Minor (Accepted Defect)** | `1` | `DEF-NT-TH038-01` / [#139](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/139) | **Technically FIXED, DEPLOYED & PARTNER-ACCEPTED** (`1/1`); **GitHub tracker still `OPEN`** (`0/1` closed) | RED `dd5dd97` (`45158080628`) → GREEN `d906698` (`45182661724`) → PR `#140` (`sprint1@3dc1758`) → PR `#142` (`main@f94dce99`, Cloud Run `nuttiew-00012-nob`, CD `45212589215`). Partner `PEW-DIY` recorded **Accepted** in [`#110` comment-7110865094](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/110#issuecomment-7110865094) (`RT-01`–`RT-03` evidenced; `RT-04` remains partner-reported `PASS` without direct NUL-byte screenshot/case evidence, because the attached 400/no-cookie screenshots covered the empty-body control request rather than the NUL-byte `RT-04` case). Separate direct automated NUL/control-character regression evidence is `AUTH-NUL-01` (PR `#140`, still passing on `sprint1@a845f56`). **Action:** Close `#139` before final PDF assembly. |
| **Not-defect** | `1` | `NT-OBS-01` | Triaged out (no code change) | Non-PII `tutorRef` display matches Sprint 1 `F-S1-03`/`F-S1-05` contracts; clarified in [defect-triage-register.md](../lab-06/defect-triage-register.md) (PR `#137`). |
| **Enhancement (Non-blocking)** | `1` | `NT-ENH-01` | Deferred (non-blocking) | Optional `GET /` HTTP security headers and `X-RateLimit-*` response headers; tracked as `TD-03` in §1.4. |

### 1.3 Automated & Selected User-Test Outcomes (Actual SHAs, Runs & Counts)

| Verification Layer | Tested SHA / Ref | Run / Environment & Command | Observed Result (`PASS / FAIL / SKIP`) | Notes / Honesty Limits |
|---|---|---|---|---|
| **Targeted TDD RED (Local)** | `fc493af8` (unchanged 60-min code/guard) | Local PG18 (`apps/api`): `vitest run test/availability.db.test.ts test/bookings.db.test.ts -t 'AVA-03\|BOOK-02\|CR-L7-01'` | **`0 passed, 3 failed, 21 unselected`** (valid RED) | Business assertions failed as expected: `AVA-03` included 89:59 Slot; HTTP 89:59 and stale ~75-min POST returned `201` instead of `422` ([verification-123.md](verification-123.md)). |
| **Targeted TDD GREEN (Local)** | `1d02e777` (90-min fix + migration) | Same command, unchanged tests | **`3 passed, 0 failed, 21 unselected`** (`PASS`) | 89:59 excluded/rejected `422 BOOKING_NOT_ELIGIBLE` with 0 Booking rows; 90:00 retained; supplemented by precision spot check (`60:00`, `89:59.999999`, `90:00`) and real lock wait `BDF-22`. |
| **Migration Upgrade & Fresh DB (Local)** | `1d02e777` | `npm run db:migrate` (upgrade old S1 PG18.7 DB with 10 synthetic Bookings + fresh DB) | **`PASS`** (1 forward migration applied; 10 existing rows unchanged; 5/5 migrations on fresh DB) | Verified same guard OID/owner/grants/security/search path and trigger definitions. |
| **Canonical Push CI (`sprint1` post-`#123`)** | `02672d4b` (`origin/sprint1`) | [Run `45464164774`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45464164774) (`2026-11-25 01:52–01:55 ICT`): Jobs `138694476641`, `138694476069`, `138694476763` | **`221/221` app tests `PASS` (`0` fail, `0` skip)** + **`158/158` GH-05 deploy checks `PASS`** | Breakdown: `29` API unit + `7` Web unit + `113` PG18 DB (15 files, incl. `AVA-03`, `CR-L7-01`, `BOOK-02/03/17/19`, `BDF-21/22/28`, `AUTH-NUL-01`) + `72` Playwright Microsoft Edge E2E. |
| **Latest Push CI (`sprint1` post-`#124`)** | `a845f563` (`origin/sprint1`) | [Run `45471154386`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45471154386) (`2026-11-25 02:31–02:34 ICT`): Jobs `138719139471`, `138719138801`, `138719139150` | **3/3 required jobs `PASS`** (`Unit / types / build`, `PG18 / Auth / Slot / Race A`, `Edge / Auth / Tutor UI E2E`) | Confirms docs-only Part C merge preserved all Sprint 1 runtime and deploy checks. |
| **Local Edge Targeted Run** | `1d02e777` | Local Playwright attempt | **`NOT RUN`** (local port collision) | Replaced by isolated GitHub Actions Edge E2E (`72/72 PASS` in Runs `45461841734`, `45464164774`, `45471154386`). |
| **Main Release CI & Cloud Run Deploy** | Pending `main` SHA | `NutTiew CI` (`main`) + `NutTiew CD - Release deploy` | **`NOT RUN / BLOCKED`** (awaiting `sprint1 -> main` PR) | Must run before final Lab 7 sign-off. |
| **Live Post-Deploy User / Smoke Tests (Lab 7)** | Pending Lab 7 Cloud Run revision | `deploy/smoke_test.py` + controlled live verification of 90-min Q05 cutoff (`< 90 min` rejected, `>= 90 min` bookable) & preserved S1 Tutor/Customer path | **`NOT RUN / BLOCKED`** (awaiting Lab 7 Cloud Run deploy) | Do **not** cite Lab 6 `nuttiew-00012-nob` smoke (`23 Nov 2026`) as proof of Lab 7 90-minute behavior. |

### 1.4 Technical Debt Register (Maintained Sprint 1 & Downstream Boundary)

*(Items below represent architectural, operational, or process debt—distinct from known defects in §1.2.)*

| ID | Technical Debt Item | Impact | Priority | Disposition / Concrete Action & Owner |
|---|---|---|---|---|
| `TD-01` | **Downstream S2 guard replaces `booking_guard_s1()` with 60-min `booking_guard_s2()`** (`20261110000000_s2_shared_transition_foundation`) | Reconciling Sprint 1 into Sprint 2/3 without a forward reconciliation migration will silently restore the pre-Lab-7 60-min Q05 rule on new Bookings while Lab 7's migration safely no-ops. | **High** *(blocks S2/S3 release, not Lab 7 S1)* | Keep out of Lab 7. Add a new forward migration and run clean + upgrade + regression checks (`VAL-016/018/021`, 90:00/89:59 new-Booking, preserved Q07 30-min & Q10/Q11/Q18 60-min) during S2/S3 reconciliation (`#149`, `@Tanaboonnnnn` & `@Chxtamos`). |
| `TD-02` | **Release tag & GitHub tracker hygiene** (no Git tags on `origin`; Defect `#139` still `OPEN`; non-default-base `sprint1` PRs lack auto-linked Development metadata) | Manual reconciliation required to trace `main` releases and defect closure metrics (`M1`, `M4`). | **Medium** | Close `#139` referencing `#110`/`#142` (`@Tanaboonnnnn`); create an annotated Git tag on the Lab 7 `main` release merge commit; link Development manually on non-default-base PRs. |
| `TD-03` | **Optional `GET /` security & `X-RateLimit-*` headers (`NT-ENH-01`)** | No broken Sprint 1 requirement, but defense-in-depth headers on static HTML and explicit rate-limit headers are absent. | **Low** | Deferred non-blocking enhancement; evaluate in a separate hardening PR prior to Final Delivery. |
| `TD-04` | **Non-PII `tutorRef` UX (`OD-AV-02`) & Vite bundle-size warning** | Customers see synthetic `tutorRef` rather than a human display name (by S1 privacy design); `npm run build` emits a non-blocking chunk-size warning. | **Low** | Preserve `tutorRef` for Sprint 1 privacy compliance; evaluate code-splitting and display-name contracts only in a future authorized feature/polish task. |

### 1.5 Operational, Security, Persistence, Config & Rollback Readiness

| Area | Check Basis | Status | Evidence & Operational Notes |
|---|---|---|---|
| **Authorization & Privacy** | Customer-only Booking creation, owner scoping, session/CSRF/origin checks, `AUTH-NUL-01` control-char rejection, non-PII DTOs | **PASS** *(staging)* | Verified by `113/113` PG18 tests + `72/72` Edge E2E (`45464164774`, `45471154386`). No private student IDs or real user data in Git. |
| **DB, Persistence & Forward Migration** | Forward-only `20261125000000_lab7_q05_min_notice`; existing rows preserved; `nuttiew_owner` (migrate) vs `nuttiew_runtime` (app) role separation | **PASS** *(staging)* | Verified on upgrade (10 existing rows unchanged, same guard OID/grants) and fresh PG18 DB (5/5 migrations). Never edits prior applied migrations. |
| **Configuration & Secrets** | `.env.example` placeholders only; Secret Manager + WIF/OIDC in `deploy.yml`; fail-closed `DEPLOY_ENABLED` gate | **PASS** *(scoped checks)* | `158/158` GH-05 checks verify the fail-closed `deploy.yml` gate and synthetic credential ignore/Docker-context rules (not a full repository/history secret scan). Targeted regex inspection on this changed Part D file found zero student IDs or inline credential assignments (`PRIVACY_LEAKS: []`), and `git diff --cached --check` verified clean whitespace only. A repository-wide Git-history secret scan (e.g., gitleaks/trufflehog) was **not run** in `#125`. Confirm `DEPLOY_ENABLED=false` after release CD. |
| **Documentation & Runbooks** | Updated Sprint 1 contracts (`requirements.md`, `srs.md`, `system-sds.md`, `F-S1-03`, `F-S1-04`), Lab 7 Parts A–D, [Lab 5 Deployment Runbook](../lab-05/deployment.md) | **PASS** *(staging)* | Complete trace from `CR-L7-01` → tests → code → CI. Minor follow-up: refresh [metrics-124.md](metrics-124.md) post-release (including `@Tanaboonnnnn`'s non-blocking §1 cohort wording clarification from PR `#164` approval). |
| **Deployment & Rollback Plan** | Single `release` job in `.github/workflows/deploy.yml` (migration job → staged revision → smoke → 100% traffic); manual image rollback to Lab 6 `nuttiew-00012-nob` (`sha256:851b688a...38673a`) | **READY** *(documented)* | **Important DB rollback caveat:** `prisma migrate deploy` is forward-only ([deployment.md §H](../lab-05/deployment.md#h-rollback-and-recovery)). Rolling back only the Cloud Run image to `nuttiew-00012-nob` would revert `availability.ts` to 60 min while `booking_guard_s1()` stays at 90 min; restoring 60-min DB enforcement requires a compensating forward migration, never `prisma migrate reset`. |
| **Post-Deploy Live Smoke Results** | Live `GET /api/ready`, changed 90-min Q05 cutoff (`< 90 min` rejected, `>= 90 min` allowed), preserved S1 Tutor/Customer workflow on deployed Lab 7 revision | **`NOT RUN / PENDING`** | Blocked on `sprint1 -> main` release and authorized Lab 5 CD execution. |

### 1.6 Explicit Readiness Decision, Remaining Blockers & Release Sequence

- **Decision for `sprint1 -> main` Release PR:** **`READY`**.
- **Decision for Final Deployed Lab 7 Maintenance Release & LEB2 Submission:** **`NOT READY`** until the following 4 sequential gates are completed before **29 Nov 2026, 23:59 ICT**:
  1. **Merge Part D PR into `sprint1`** — Owner: `@Tanaboonnnnn` (review & merge this PR).
  2. **Reviewed `sprint1 -> main` Release PR + Annotated Git Tag** — Owner: `@Chxtamos` / `@Tanaboonnnnn` (open `sprint1 -> main` PR, pass `NutTiew CI` on PR + `main`, human approval & merge, create annotated Git tag on the `main` merge SHA).
  3. **Authorized Lab 5 CD Deploy & Post-Deploy Smoke Checks** — Owner: `@Tanaboonnnnn` / `@Chxtamos` (enable `DEPLOY_ENABLED=true`, manually dispatch `NutTiew CD - Release deploy` on the exact `main` SHA, approve `demo` environment, verify new Cloud Run revision + `100%` traffic + live smoke for 90-min Q05 cutoff & preserved S1 flow, then reset `DEPLOY_ENABLED=false`).
  4. **Final Evidence Refresh & LEB2 PDF Submission** — Owner: `@Tanaboonnnnn` (close `#139` with `#110` evidence), `@Chxtamos` & `@Tanaboonnnnn` (refresh [metrics-124.md](metrics-124.md) with final `main` SHA/tag/CD/smoke and §1 cohort wording clarification, update `EV-L7-07`/`EV-L7-08`, assemble local untracked `Lab7_CPE334_NutTiew_Parts_A_D.pdf` with both students' names/IDs, upload via LEB2, and post the verified receipt on `#125` before closing `#125`).

---

## 2. Downstream Handoff Summary (`#122` / `#123` → Sprint 2 & Sprint 3 Reconciliation)

- **Lab 7 Maintainer Reference:** `sprint1` commits `61df8885` (`#122` Part A), `02672d4b` (`#123` Part B), `a845f563` (`#124` Part C); final `main` release SHA/tag **PENDING** (`EV-L7-07`).
- **Rule & Mechanism to Preserve:** `CR-L7-01` sets Q05 new Customer Booking & bookable availability notice to **`>= 90 minutes`** via `apps/api/src/availability.ts` (`T_view`) and forward migration `apps/api/prisma/migrations/20261125000000_lab7_q05_min_notice/migration.sql` (`booking_guard_s1()`, `T_elig`).
- **Known Reconciliation Risk (`TD-01`):** Sprint 2 migration `20261110000000_s2_shared_transition_foundation` replaces `booking_guard_s1()` with `booking_guard_s2()` using the old `60 minutes` Q05 threshold, and Lab 7's migration intentionally returns early if `booking_guard_s2()` already exists.
- **Required Downstream Checks — Status: `PENDING` *(blocks Sprint 2/3 releases under `#149`, NOT this Lab 7 Sprint 1 submission)*:**
  1. Add a new forward migration after S2/S3 integration updating only the new-Booking Q05 check in `booking_guard_s2()` to `90 minutes` (never edit applied migrations).
  2. Verify both **clean DB** and **upgrade from Lab 7 `main`** migrations preserve existing rows and enforce `90:00` pass / `89:59` fail on new-Booking projection and `INSERT` guard.
  3. Run regression tests confirming unchanged later-sprint rules: `VAL-016`, `VAL-018`, `VAL-021`, Customer cancellation `Q07 = 30 min`, reschedule `Q10/Q11 = 60 min`, and Tutor cancellation `Q18 = 60 min`.

---

## 3. Three Brief Retrospective Answers

1. **What helped?** Pinning Lab 7 strictly to `sprint1` and enforcing teammate contract review (`#122` / PR `#162`) before writing RED/GREEN tests (`#123` / PR `#163`) kept `CR-L7-01` isolated to two runtime files and produced a clean `221/221` CI pass with zero Sprint 2/3 entanglement.
2. **What hurt?** Leaving Defect Issue `#139` open after PR `#140`/`#142` deployment and discovering inconsistent metric cohort timestamps during PR `#164` review caused extra reconciliation work and one Request-Changes round-trip before Part C merged.
3. **What will change before Final Delivery?** `@Tanaboonnnnn` and `@Chxtamos` will run a mandatory post-merge tracker-and-tag checklist (closing linked Defect Issues, applying an annotated `main` release tag, and refreshing snapshot dates immediately after each `main` CD run) starting with the Lab 7 `sprint1 -> main` release and the Sprint 2/3 Q05 reconciliation under `#149`.

---

## 4. Public-Safe Lab 7 Parts A–D Submission Index & Governance

> **LEB2 Submission Status: `PENDING — NOT YET UPLOADED`.** The single self-contained team PDF (`Lab7_CPE334_NutTiew_Parts_A_D.pdf`, containing both students' legal names and private Student IDs outside Git) will be assembled only after `EV-L7-07` (`sprint1 -> main` release + tag), `EV-L7-08` (Cloud Run deploy + live 90-min smoke), `#139` closure, and final `metrics-124.md` refresh. Record the actual LEB2 submission receipt on `#125` only after upload confirmation (deadline: **29 Nov 2026, 23:59 Thailand time**).

### 4.1 Parts A–D Contents Map (for Final Controlled PDF Assembly)

| Part | Planned PDF Pages | Graded Content & Embedded Evidence | Linked Issues / PRs | Authoritative Repo Sources & Evidence IDs |
|---|---|---|---|---|
| **Cover & TOC** | *TBD at PDF build* | Both students' names & Student IDs *(local PDF only)*, repo/deployed URLs, accepted baseline vs pre-change vs final `main` tag/SHA, complete version table, rubric contents map | `#125` | `EV-L7-01`..`EV-L7-08`, this index |
| **Part A — Change Definition & Impact** | *TBD at PDF build* | Old (`60 min`) vs new (`90 min`) Q05 rule, 25 Nov in-class no-external-approval note, impact & traceability table, revised SRS/SDS/STS excerpts, pre-implementation teammate review (`PR #162`) | `#122` ([PR `#162`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/162)) | [cr-l7-01.md](cr-l7-01.md), updated `docs/requirements.md`, `docs/srs.md`, `docs/system-sds.md`, `docs/features/F-S1-03/*`, `docs/features/F-S1-04/*` (`EV-L7-02`, `EV-L7-03`) |
| **Part B — Test-First Implementation & Verification** | *TBD at PDF build* | Valid RED (`fc493af8`: 0/3) → GREEN (`1d02e777`: 3/3) outputs, scoped diff (`availability.ts` + forward migration `20261125000000_lab7_q05_min_notice`), precision & lock checks (`BDF-21/22`), upgrade/fresh migration evidence, `221/221` CI + `158/158` GH-05 (`45464164774`), teammate review (`PR #163`), plus post-release `main` CD & live smoke (`EV-L7-07`/`08`) | `#123` ([PR `#163`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/163)) | [verification-123.md](verification-123.md), `apps/api/src/availability.ts`, `apps/api/prisma/migrations/20261125000000_lab7_q05_min_notice/migration.sql` (`EV-L7-04`, `EV-L7-07`, `EV-L7-08`) |
| **Part C — Five Sourced Metrics & Action** | *TBD at PDF build* | Five exact sourced metrics (`M1` Issues, `M2` Merged PRs, `M3` Automated Tests, `M4` UAT Defect Status, `M5` CI/CD Outcomes), underlying reconciliation tables, and ≤100-word evidence-based action *(refreshed post-release)* | `#124` ([PR `#164`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/164)) | [metrics-124.md](metrics-124.md) (`EV-L7-05`) |
| **Part D — Readiness, Retrospective & Handoff** | *TBD at PDF build* | Release readiness checklist, defects by severity, technical debt register (`TD-01`..`TD-04`), honest readiness verdict, downstream S2/S3 handoff, 3 brief retrospective answers, contributions, AI-use declaration, known limitations, LEB2 receipt *(post-upload)* | `#125` (this PR) | This file (`EV-L7-06`..`EV-L7-08`) |

### 4.2 Verified Team Contributions (Lab 7)

| Team Member | Verified Lab 7 Contributions |
|---|---|
| **`@Tanaboonnnnn`** | Authored Lab 7 Part A contract (`#122` / PR `#162`, `2bafd707` → `ed35b4b2`), authored Part B TDD RED→GREEN implementation & forward migration (`#123` / PR `#163`, `fc493af8` → `1d02e777` → `a410a30b`), reviewed & approved Part C metrics (`#124` / PR `#164`, RC on `fecae3ed` → Approved `c38f7538`), and assigned reviewer for Part D (`#125`). |
| **`@Chxtamos`** | Independently reviewed & approved Part A contract (`#122` / PR `#162`, RC on `2bafd707` → Approved `ed35b4b2`), independently reviewed & approved Part B implementation (`#123` / PR `#163`, Approved `a410a30b`), authored Part C five sourced metrics (`#124` / PR `#164`, `fecae3ed` → `c38f7538`), and authored Part D release readiness, retrospective & submission index (`#125`). |

### 4.3 AI-Use Declaration

- AI coding and review assistants were used during Lab 7 to help draft documentation structure, query GitHub CLI/Actions metadata for metric reconciliation, run local verification checks, and—when explicitly instructed by the user—execute GitHub review and merge actions (including submitting `APPROVE` reviews and merging PRs such as `#159` [`2702787`] and `#164` [`a845f56`]).
- **Review & Governance Separation (`AGENTS.md §2`):** Parts A–C (`#122` / PR `#162`, `#123` / PR `#163`, `#124` / PR `#164`) have been reviewed and merged into `sprint1` against live Git commits, PostgreSQL 18 execution, and GitHub Actions CI logs, whereas Part D (`#125` / PR `#165`) has only an AI-assisted Request Changes review so far and **still requires actual human teammate GitHub review** from `@Tanaboonnnnn` before merge. AI-assisted reviews are additional checks only and never substitute for required human peer review.
- **Cloud Safety Boundary:** No AI tool deployed to GCP or modified Cloud Run, Cloud SQL, IAM, Secret Manager, or billing resources.

### 4.4 Known Limitations

1. **Release & Live Smoke Pending at Part D Authoring Time:** `origin/main` remains Lab 6 `f94dce99` (`nuttiew-00012-nob`); `sprint1 -> main` release PR, Git tag, Cloud Run deploy, and live 90-minute smoke checks remain mandatory pre-submission gates (`EV-L7-07`, `EV-L7-08`).
2. **Pre-Release Metrics Snapshot:** [metrics-124.md](metrics-124.md) reflects snapshot `2026-11-25 01:56 ICT` (`sprint1@02672d4`) and must be refreshed after `#139` closure, `sprint1 -> main` release, and Lab 7 Cloud Run deploy before building the final LEB2 PDF.
3. **Lab 6 `RT-04` Caveat:** Partner retest `RT-04` (`#110`) remains partner-reported `PASS` without direct NUL-byte screenshot/case evidence (the attached 400/no-cookie screenshots covered the empty-body control request, not the NUL-byte `RT-04` case); direct automated NUL/control-character regression evidence is separately provided by `AUTH-NUL-01` (PR `#140`).
4. **Deferred Later-Sprint Reconciliation (`TD-01`):** Sprint 2's `booking_guard_s2()` still enforces `60 minutes`; reconciling `CR-L7-01` into Sprint 2/3 is intentionally excluded from Lab 7 and tracked separately under `#149`.
5. **Local Edge E2E Port Collision:** Local Playwright Edge launch hit a local port conflict during `#123`; full Edge E2E (`72/72 PASS`) was verified in isolated GitHub Actions CI (`45461841734`, `45464164774`, `45471154386`).
