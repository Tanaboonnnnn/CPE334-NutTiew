# Lab 7 Part C — Five Sourced Engineering Metrics & Evidence-Based Action (`L7-03` / Issue #124)

> **Status: PRE-RELEASE SNAPSHOT ON MAINTAINED `sprint1@02672d4` (25 Nov 2026 01:56 ICT).**
> This document delivers [Issue #124](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/124) (`Lab 7` Part C) from live GitHub Issues, Pull Requests, GitHub Actions runs, and Lab 6 triage records for repository `Tanaboonnnnn/CPE334-NutTiew`.
> **Honesty boundary:** `#123` (PR `#163`) is merged and CI-verified on `origin/sprint1@02672d4b475dc15018e182467c0468c4f63accf4`, while the separate `sprint1 -> main` Lab 7 release PR and GCP Cloud Run deploy remain **PENDING / NOT RUN** (`origin/main` is still Lab 6 `f94dce99`). Refresh this snapshot after the `#123` `sprint1 -> main` release and post-deploy smoke test before assembling the final Lab 7 PDF (`#125`).

## 1. Observation Window & Snapshot Provenance

- **Repository / Product:** `Tanaboonnnnn/CPE334-NutTiew` (CPE334 NutTiew Tutoring Appointment System).
- **Observation Window:** `2026-11-03 00:00 ICT` through **`2026-11-25 01:56 ICT`** (spanning the full project lifecycle from earliest PR `#1` opened at `2026-11-03 12:49:17 ICT`, earliest Issue `#8` opened at `2026-11-03 13:54:04 ICT`, and earliest workflow run at `2026-11-05 02:28:59 ICT` through immediately after `origin/sprint1@02672d4` push CI Run `45464164774` completed `success` at `2026-11-25 01:55:56 ICT`).
- **Cohort Rule:** Every metric counts items **created within the observation window**, evaluated by their **status as of snapshot `2026-11-25 01:56 ICT`**.
- **Pinned Branch Heads at Snapshot:**
  - `origin/main`: `f94dce99af198b225aafb54bfbf46da420836f35` (accepted Lab 6 Sprint 1 release, Cloud Run `nuttiew-00012-nob`, CD Run `45212589215`).
  - `origin/sprint1`: `02672d4b475dc15018e182467c0468c4f63accf4` (Lab 7 Q05 merge PR `#163`, push CI Run `45464164774` 3/3 PASS).
- **Scope Separation:** Repository-wide historical totals are reported alongside explicit Sprint 1 / Lab 5–7 vs Sprint 2 / Sprint 3 breakdowns. Maintained Sprint 1 test and CI metrics (Metrics 3 & 5) strictly isolate `sprint1` / `main` evidence and never substitute Sprint 2/3 passing runs.

## 2. Executive Summary of the Five Metrics

| # | Metric | Scope & Window (ICT) | Verified Value at Snapshot (`2026-11-25 01:56 ICT`) | Primary Source & Evidence ID |
|---|---|---|---|---|
| **M1** | **Completed Issues** | Repo-wide created `2026-11-03 00:00` – `2026-11-25 01:56`, status as of snapshot (S1/L5–L7 vs S2/S3 split) | **52 completed** (`52/58 = 89.7%` excl. `5` `NOT_PLANNED`; `52/63 = 82.5%` overall; `6` open repo-wide: **`4` open in S1/L5–L7** `#123,#124,#125,#139` + `2` open in S3 `#149,#150`; **S1+L5–L7: `38/42 = 90.5%`** excl. `5` `NOT_PLANNED`) | `gh issue list --state all --limit 300`; §3.1 table |
| **M2** | **Merged Pull Requests** | Repo-wide created `2026-11-03 00:00` – `2026-11-25 01:56`, status as of snapshot (by target branch) | **89 merged** (`89/95 = 93.7%` overall; **`70` on `sprint1`+`main`**: `58` `sprint1`, `12` `main`; `12` `sprint2`, `7` `sprint3`; `5` closed-unmerged; `1` open) | `gh pr list --state all --limit 300`; §3.2 tables |
| **M3** | **Automated Test Results** | Maintained Sprint 1 head `origin/sprint1@02672d4` (`2026-11-25 01:52–01:55`) | **221/221 app tests PASS (`100.0%`)**, `0` failed, `0` skipped (`29` API unit, `7` Web unit, `113` PG18 DB, `72` Edge E2E) + **`158/158` GH-05 deploy script checks PASS** | `NutTiew CI` push [Run `45464164774`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45464164774) (`138694476641`, `138694476069`, `138694476763`) |
| **M4** | **UAT Defect Status** | Lab 6 Sprint 1 Partner UAT (`2026-11-22` – `2026-11-25 01:56`) | **1 accepted `Minor` defect (`DEF-NT-TH038-01` / `#139`)**: **`1/1` (`100.0%`)** fixed, released (`main@f94dce9`) & partner-accepted (`#110`), **`0/1` closed on GitHub tracker (`#139` still `OPEN`)**; `0` Critical/Major; `1` Not-defect (`NT-OBS-01`); `1` Enhancement (`NT-ENH-01`); `0` duplicate | [defect-triage-register.md](../lab-06/defect-triage-register.md), `#110` (`comment-7110865094`), `#139` |
| **M5** | **CI Run Outcomes** | `NutTiew CI` & `NutTiew CD - Release deploy`, created `2026-11-03 00:00` – `2026-11-25 01:56` (latest attempt per unique run ID) | **`main+sprint1` `NutTiew CI`: `76/76` (`100.0%`) success** (`66` `sprint1`, `10` `main`, `2` reruns); **Repo-wide `NutTiew CI`: `229/292` (`78.4%`) success**, `22` fail (`7.5%`), `41` cancelled (`14.0%`); **`NutTiew CD` (`main`): `3/18` (`16.7%`) success**, `14` fail (`77.8%`), `1` cancelled (`5.6%`) | GitHub Actions API (`313` unique runs incl. `3` non-required PDF runs); §3.5 tables |

---

## 3. Detailed Metric Definitions, Underlying Tables & Reconciliation

### 3.1 Metric 1 — Completed Issues

- **Definition:** GitHub Issues created during `2026-11-03 00:00 ICT` – `2026-11-25 01:56 ICT` with `state = CLOSED` and `stateReason = COMPLETED` as of snapshot `2026-11-25 01:56 ICT`. Issues closed with `stateReason = NOT_PLANNED` (cancelled/superseded placeholders `#63`–`#67`) and `OPEN` Issues (`6` repo-wide: `4` in S1/L5–L7 `#123, #124, #125, #139` + `2` in Sprint 3 `#149, #150`) are tracked separately and excluded from the `COMPLETED` numerator.
- **Reconciliation by Scope (all `63` repository Issues):**

| Scope Group | Completed (`COMPLETED`) | Cancelled / Superseded (`NOT_PLANNED`) | Open (`OPEN`) | Group Total | Completed IDs (ICT Completion Date) |
|---|---:|---:|---:|---:|---|
| **Sprint 1 Core** | 18 | 0 | 0 | 18 | `#8`–`#12`, `#19` (11-03); `#13` (11-04); `#14` (11-06); `#33` (11-08); `#15`–`#17`, `#39` (11-09); `#44` (11-10); `#50` (11-11); `#48`, `#53` (11-12); `#18` (11-13) |
| **Lab 5 (S1 CD)** | 11 | 5 | 0 | 16 | `#60`–`#62` (11-13); `#58`, `#68`, `#76`, `#78` (11-14); `#81`, `#82` (11-15); `#85` (11-16); `#100` (11-20). *`NOT_PLANNED` (11-13): `#63`–`#67` (`GCP-LATER-01..05`)* |
| **Lab 6 (S1 UAT)** | 8 | 0 | 1 | 9 | `#104`, `#105` (11-21); `#106`–`#109` (11-23); `#110`, `#111` (11-24). *`OPEN`: `#139` (`DEF-NT-TH038-01`)* |
| **Lab 7 (S1 Maint)** | 1 | 0 | 3 | 4 | `#122` (11-25). *`OPEN`: `#123`, `#124`, `#125`* |
| *Subtotal S1 + L5–L7* | *38* | *5* | *4* | *47* | *`38 / 42 = 90.5%` excl. `NOT_PLANNED` (`38 / 47 = 80.9%` incl. `NOT_PLANNED`)* |
| **Sprint 2 (Separate)** | 9 | 0 | 0 | 9 | `#114` (11-21); `#115`–`#121`, `#127` (11-22) |
| **Sprint 3 (Separate)** | 5 | 0 | 2 | 7 | `#144`, `#145` (11-24); `#146`–`#148` (11-25). *`OPEN`: `#149`, `#150`* |
| **Repository Total** | **52** | **5** | **6** | **63** | **`52 / 58 = 89.7%` excl. `NOT_PLANNED` (`52 / 63 = 82.5%` overall)** |

### 3.2 Metric 2 — Merged Pull Requests

- **Definition:** Pull requests created during `2026-11-03 00:00 ICT` – `2026-11-25 01:56 ICT` (starting with PR `#1` opened `2026-11-03 12:49:17 ICT`) with `state = MERGED` as of snapshot `2026-11-25 01:56 ICT` in `Tanaboonnnnn/CPE334-NutTiew`. Closed-unmerged (`5`: `#1`, `#29`, `#46`, `#52`, `#73` intentionally failing GH-04 probe) and open (`1`: `#161` on `sprint3`) PRs are excluded from the merged count.
- **Reconciliation by Target Branch (all `95` repository PRs):**
  - `sprint1`: **58** merged (`58/89 = 65.2%` of merged PRs)
  - `main`: **12** merged (`12/89 = 13.5%`) — *Subtotal `sprint1 + main` = **70** merged*
  - `sprint2` (separate): **12** merged (`12/89 = 13.5%`)
  - `sprint3` (separate): **7** merged (`7/89 = 7.9%`)
  - Total: `58 + 12 + 12 + 7 = 89` merged + `5` closed-unmerged + `1` open = **`95` PRs** (`89/95 = 93.7%` merge rate; `89/94 = 94.7%` excluding GH-04 probe `#73`).

**Complete `main` Release PR Register (`12 / 12` reconcilable by hand):**

| PR | Head -> Base | Merged At (ICT) | Merge SHA | Title |
|---|---|---|---|---|
| `#55` | `sprint1 -> main` | 2026-11-13 02:00 | `4cbfb8c` | `release(sprint1): Sprint 1 Vertical Slice & Deliverable 1` |
| `#69` | `sprint1 -> main` | 2026-11-13 05:09 | `cd284ef` | `docs(release): sync Final Deliverable 1 PDF into main` |
| `#79` | `sprint1 -> main` | 2026-11-14 23:20 | `4047170` | `release(lab5): sprint1 -> main (#78)` |
| `#84` | `sprint1 -> main` | 2026-11-15 17:27 | `efd2998` | `release(lab5): promote reviewed deploy hardening and runtime IAM` |
| `#87` | `sprint1 -> main` | 2026-11-16 15:38 | `f8e65f6` | `release: promote NutTiew Issue #85 UI redesign` |
| `#90` | `sprint1 -> main` | 2026-11-17 16:04 | `88e1c2f` | `release(lab5): reviewed CD readiness (C-06)` |
| `#93` | `sprint1 -> main` | 2026-11-17 18:01 | `fd6b7ec` | `release(lab5): fix digest lookup for reviewed CD retry (C-06)` |
| `#95` | `sprint1 -> main` | 2026-11-18 06:20 | `ce49584` | `release(lab5): fix Cloud Run migration polling (C-06)` |
| `#97` | `sprint1 -> main` | 2026-11-18 18:17 | `92b4f54` | `release(lab5): resolve reserved Cloud Run PORT (C-06)` |
| `#99` | `sprint1 -> main` | 2026-11-19 10:53 | `ff55ac7` | `release(lab5): staged Cloud Run revision and traffic switch (C-06)` |
| `#103` | `sprint1 -> main` | 2026-11-20 16:40 | `42bb762` | `release(lab5): promote verified C-04/C-05 evidence` |
| `#142` | `sprint1 -> main` | 2026-11-23 22:24 | `f94dce9` | `release(lab6): promote DEF-NT-TH038-01 auth fix (#139) & Lab 6 evidence` |

**Recent Lab 6 & Lab 7 `sprint1` Merged PRs (`#137`–`#163`):** `#137` (`b7a9d62`, 11-23), `#138` (`b14392b`, 11-23), `#141` (`f844326`, 11-23 19:58), `#140` (`3dc1758`, 11-23 21:01), `#143` (`102c51b`, 11-23 22:11), `#152` (`c2213df`, 11-24 15:50), `#162` (`61df888`, 11-25 01:20, `#122`), `#163` (`02672d4`, 11-25 01:52, `#123`).

### 3.3 Metric 3 — Automated Test Results (Maintained Sprint 1 Head)

- **Definition:** Exact passed/failed/skipped counts from the latest canonical GitHub Actions `NutTiew CI` push run on maintained `origin/sprint1@02672d4b475dc15018e182467c0468c4f63accf4` ([Run `45464164774`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45464164774), completed `2026-11-25 01:55 ICT`), post-merge of PR `#163` (`CR-L7-01` 90-minute Q05 cutoff). Prior PR `#163` run ([Run `45461841734`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45461841734) on `a410a30`) produced identical suite counts (`15` PG18 files, `72` Edge E2E).

| Suite / Job | CI Job ID | Exact Command / Scope | Files | Passed | Failed | Skipped | Pass Rate |
|---|---|---|---:|---:|---:|---:|---:|
| `@nuttiew/api` Unit (`Unit / types / build`) | `138694476641` | `vitest run test/security.test.ts test/client-ip.test.ts test/slot-time.test.ts test/config.test.ts` | 4 | 29 | 0 | 0 | `29/29` (100.0%) |
| `@nuttiew/web` Unit (`Unit / types / build`) | `138694476641` | `vitest run test/customer-availability-calendar.test.ts test/tutor-metrics.test.ts` | 2 | 7 | 0 | 0 | `7/7` (100.0%) |
| PostgreSQL 18 Integration (`PostgreSQL 18 / Auth / Slot / Race A`) | `138694476069` | `npm run test:db` (15 suites incl. `AVA-03`, `CR-L7-01`, `BOOK-02/03/17/19`, `BDF-21/22/28`, `AUTH-NUL-01`) | 15 | 113 | 0 | 0 | `113/113` (100.0%) |
| Microsoft Edge E2E (`Microsoft Edge / Auth / Tutor UI E2E`) | `138694476763` | `npm run test:e2e` (Playwright Edge + real API + PG18) | — | 72 | 0 | 0 | `72/72` (100.0%) |
| **Subtotal Application Automated Tests** | — | **Vitest + Playwright on `sprint1@02672d4`** | **21** | **221** | **0** | **0** | **`221/221` (100.0%)** |
| Offline Deploy Script Checks (`GH-05`) | `138694476641` | `Unit / types / build` offline deploy & `deploy.yml` gate tests | — | 158 | 0 | 0 | `158/158` (100.0%) |

- **Reconciliation & Limits:** CI logs for Run `45464164774` confirm `0` failed and `0` skipped across all `221` application tests (preservation of test assertions and invariants is verified separately in the reviewed PR `#163` diff at `a410a30`). Local RED/GREEN progression (`fc493af` 0/3 RED -> `1d02e77` 3/3 GREEN) is recorded separately in [verification-123.md](verification-123.md). **`sprint1 -> main` release CI and live GCP Cloud Run smoke tests are NOT RUN at this snapshot** (`origin/main` remains `f94dce99`).

### 3.4 Metric 4 — UAT Defect Status

- **Definition of Resolved:** An accepted Sprint 1 UAT defect is counted as **technically resolved & accepted** when (1) RED -> GREEN regression fix is merged to `sprint1`, (2) promoted to `main` and deployed via CI/CD, and (3) partner acceptance is recorded in `#110`; it is counted as **fully closed on tracker** only when its GitHub Defect Issue is also `CLOSED`.
- **Reconciliation of All Lab 6 Triaged Findings (`3` findings; `0` duplicates):**

| Finding ID | Classification / Severity | GitHub Issue & Snapshot State | Fix / Release / Acceptance Evidence | Reconciliation Status |
|---|---|---|---|---|
| **`DEF-NT-TH038-01`** | **Accepted Defect** / `Minor` | **[#139](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/139)** — **`OPEN`** *(tracker closure pending)* | RED `dd5dd97` (`45158080628`) -> GREEN `d906698` (`45182661724`) -> PR `#140` (`sprint1@3dc1758`) -> PR `#142` (`main@f94dce99`, Cloud Run `nuttiew-00012-nob`, CD `45212589215`) -> Partner `PEW-DIY` **Accepted** ([`#110` comment-7110865094](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/110#issuecomment-7110865094); `RT-04` partner-reported PASS without direct screenshot, corroborated by `AUTH-NUL-01`) | **1/1 (`100.0%`) fixed, deployed & accepted**; **0/1 closed on GitHub tracker** (`#139` remains `OPEN`) |
| `NT-OBS-01` | `Not-defect` / N/A | None | Matches Sprint 1 `F-S1-03`/`F-S1-05` non-PII `tutorRef` contracts; handoff clarified (`PR #137`) | Triaged out (not a defect) |
| `NT-ENH-01` | `Enhancement` / Non-blocking | None | Optional `GET /` security headers & `X-RateLimit-*` | Deferred (non-blocking) |

### 3.5 Metric 5 — CI Run Outcomes

- **Definition:** Completed GitHub Actions workflow runs created in `Tanaboonnnnn/CPE334-NutTiew` during `2026-11-03 00:00 ICT` – `2026-11-25 01:56 ICT`, counted using the **latest attempt per unique GitHub Actions run ID** (superseded attempts of a rerun are not double-counted; runs with `run_attempt > 1` are disclosed separately). Non-required workflow `Build Illustrated D1 PDF` (`3` unique runs: `1` success, `2` failure) is excluded from required CI/CD gates and noted for completeness (`292 + 18 + 3 = 313` unique repository runs).

| Workflow & Branch Scope | Success | Failure | Cancelled | Total | Success Rate | Reruns (`attempt > 1`) | Notes / Reconciliation |
|---|---:|---:|---:|---:|---:|---:|---|
| **`NutTiew CI` — `sprint1` + `main` (Protected/Integration)** | **76** | **0** | **0** | **76** | **`76/76` (100.0%)** | 2 | `sprint1`: `66/66` (`45189865284` att. 2); `main`: `10/10` (`44712718679` att. 2). Latest: `45464164774` (`sprint1@02672d4`). |
| **`NutTiew CI` — All branches (Repo-wide)** | 229 | 22 | 41 | 292 | `229/292` (78.4%) | 8 | Failures include intentional RED TDD commits (`45158080628`), GH-04 probe (`#73`), and PR dev flakes (`45385146976`). Cancellations are concurrency-superseded PR pushes. |
| **`NutTiew CD - Release deploy` — `main`** | **3** | **14** | **1** | **18** | **`3/18` (16.7%)** | 0 | All `3` successes (`44455509285`, `44784128286`, `45212589215`) were authorized manual `workflow_dispatch`; `14` failures were fail-closed `disable-gate` runs on `push` to `main` (`DEPLOY_ENABLED` off) + early Lab 5 C-06 bring-up. |

**Recent `main` + `sprint1` `NutTiew CI` Runs (`2026-11-23` – `2026-11-25 01:56 ICT`, `9/9` PASS):**
`45179350920` (`sprint1`, `f844326`), `45189865284` (`sprint1`, `3dc1758`, attempt 2), `45193114707` (`sprint1`, `3dc1758`), `45202348141` (`sprint1`, `102c51b`), `45202361683` (`sprint1`, `102c51b`), `45204901005` (`main`, `f94dce9`), `45359605097` (`sprint1`, `c2213df`), `45458467458` (`sprint1`, `61df888`), `45464164774` (`sprint1`, `02672d4`).

---

## 4. Evidence-Based Interpretation & Action (<= 100 Words)

Although maintained `sprint1@02672d4` passes 221/221 automated tests and 76/76 `main+sprint1` `NutTiew CI` runs, two concrete risks appear in the metrics: (1) Defect Issue `#139` remains `OPEN` despite PR `#140`/`#142` deployment and `#110` acceptance, causing tracker drift; and (2) Lab 7 Q05 (`90` minutes) is not yet released to `main`/GCP (`origin/main` remains `f94dce9`), while Sprint 2's `booking_guard_s2()` still enforces `60` minutes. **Action:** `@Tanaboonnnnn` closes `#139` with `#110` evidence and `@Chxtamos` reviews the `#123` `sprint1 -> main` release PR plus GCP smoke test before 29 Nov 2026; both reconcile Q05 into Sprint 2/3 under `#149`.
