# Sprint 3 Release-Gate Audit & Readiness Ledger (Issue #149 / S3-05)

> **VERDICT: `BLOCKED` FOR `sprint3 -> main` RELEASE MERGE & GCP CLOUD RUN DEPLOYMENT (Updated 25 Nov 2026 15:15 ICT).**
> **Selected Release Sequencing — PATH A IS FINAL:** Separate sequential releases are mandatory (`1. Lab 7 Sprint 1 -> main` → `2. Sprint 2 -> main` → `3. Sprint 3 -> main`). **Do NOT combine Sprint 2 and Sprint 3 into one release.**
> This document records live, verified repository, CI, Lab 6/7, and Sprint 2/3 release-gate evidence for [Issue #149](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/149) per AC #5 (*"if gated, document BLOCKED rather than claim released"*). It does **not** merge to `main`, tag a release, alter Lab 6/7 or Sprint 2 environments, or run any GCP Cloud Run / IAM / billing / secret / production DB change.

## 1. Verified Remote Heads & Git Ancestry (25 Nov 2026 15:15 ICT)

| Branch / Target | Verified Remote SHA | Current Role / Status |
|---|---|---|
| `origin/main` | `f94dce99af198b225aafb54bfbf46da420836f35` | Live Lab 6 / Sprint 1 release (`PR #142`, merged 23 Nov 2026; deployed Cloud Run revision `nuttiew-00012-nob`, [CD Run 45212589215](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45212589215)). **Contains Sprint 1 + Lab 6 only — zero Lab 7, Sprint 2, or Sprint 3 code.** |
| `origin/sprint1` | `8b92459a14dde1ceb2f5d3bbdea0baa5b49c7a83` | Lab 7 Sprint 1 maintenance candidate (`CR-L7-01` 90-minute Q05 cutoff + forward migration `20261125000000_lab7_q05_min_notice`, PRs `#162`–`#165` merged; push CI [Run 45571332507](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45571332507) `PASS`). **Pending separate `sprint1 -> main` release, tag, and GCP deploy ([Issue #125](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/125) reopened).** |
| `origin/sprint2` | `e61b8085da9006c96baf8fdd768d833b8684be24` | Verified Sprint 2 feature integration candidate (`PR #153`). **Not yet reconciled with Lab 7 `main`, missing Q05 90-min forward migration on `booking_guard_s2()`, and never merged/released to `main` ([Issue #120](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/120) reopened).** |
| `origin/sprint3` | `08f759084ebc0cfccb2c9055845f826c02fd44ab` | Verified pre-reconciliation Sprint 3 integration candidate (`PR #160` `#148` merge; `#148` is **`CLOSED`**). Push CI [Run 45446755454](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45446755454) **PASS 3/3** (`Unit / types / build` `138632520513`, `PostgreSQL 18 / Auth / Slot / Race A` `138632520750`, `Microsoft Edge / Auth / Tutor UI E2E` `138632519618`). **Must re-run full integrated regression after Sprint 2 `main` reconciliation.** |
| Remote Git Tags (`origin`) | *(none)* | `git ls-remote --tags origin` returned 0 tags; no Lab 7, Sprint 2, or Sprint 3 release tag exists. |

### Git Ancestry Checks (`git merge-base --is-ancestor`)

- `origin/main` ancestor of `origin/sprint2`: **NO** — Lab 6 commits on `main` (and upcoming Lab 7 `main` release) are absent from `origin/sprint2`.
- `origin/main` ancestor of `origin/sprint3`: **NO** — `main`'s Lab 6/Lab 7 history and future Sprint 2 `main` release are not ancestors of `origin/sprint3` (PR `#160` carried forward `#139`/`#140` runtime fix + `AUTH-NUL-01` into `sprint3`, but full `main` reconciliation remains pending).
- `origin/sprint2` ancestor of `origin/sprint3`: **NO** — diverged at PR `#153`; reconciliation must proceed strictly via `main` under Path A.

## 2. Pre-Reconciliation Sprint 3 Candidate Register (`origin/sprint3@08f75908`)

| PR | Issue | Scope | Merge Commit (`sprint3`) | Verified CI Evidence |
|---|---|---|---|---|
| [#154](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/154) | #144 (`CLOSED`) | Sprint 3 branch separation & Part E readiness | `fea996d` | Merged & verified on `sprint3` |
| [#156](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/156) | #145 (`CLOSED`) | D2 Past Booked vertical slice (`SUM-01..08`) | `175b88d` | [Run 45362315140](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45362315140) (3/3 PASS) |
| [#157](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/157) | #146 (`CLOSED`) | `OD-006` Option 1 decision record, Part E/SRS sync & `SUM-08b` stabilization | `fcaae4e` | [Run 45402851017](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45402851017) (3/3 PASS) |
| [#158](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/158) | #147 (`CLOSED`) | Owner-only Cancelled Tutor summary (`AC-S3-01-08`) | `a68eca4` | [Run 45419585456](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45419585456) (3/3 PASS) |
| [#159](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/159) | #146 (`CLOSED`) | Upcoming & In-Progress Tutor summary (`AC-S3-01-07/09`) | `2702787` | [Run 45439725513](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45439725513) (3/3 PASS) |
| [#160](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/160) | #148 (`CLOSED`) | Integrated 4-category DB/restart/E2E verification + Lab 6 `#139`/`#140` reconciliation | `08f7590` | PR [Run 45445357326](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45445357326) (3/3 PASS); push [Run 45446755454](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45446755454) (3/3 PASS) |

See [verification-148.md](../features/F-S3-01/verification-148.md) for the pre-reconciliation `#148` requirement-to-test matrix. **Note:** Do not treat pre-reconciliation `#148` CI results as proof for the post-reconciliation Lab 7 + Sprint 2 + Sprint 3 candidate; full integrated regression must be re-executed in Phase 5.2.

## 3. Release Gate Audit Against Issue #149 Acceptance Criteria

| Gate | Issue #149 AC / Rule | Status | Verified Evidence / Exact Blocker |
|---|---|---|---|
| **G1 — Lab 6 UAT Acceptance & Defect `#139` Reconciliation** | AC #1 | **VERIFIED WITH OPEN TRACKER GAP** | [Issue #110](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/110) (`CLOSED`, [comment-7110865094](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/110#issuecomment-7110865094)) records `PEW-DIY (TH-056_P2) -> NutTiew: Accepted` on `nuttiew-00012-nob` (`main@f94dce9`, [CD Run 45212589215](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45212589215/job/137825262880)), and `NutTiew -> PEW-DIY: Accepted with Minor limitations`. However, [Issue #139](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/139) remains **`OPEN`**: `RT-04` is partner-reported `PASS` without direct NUL-byte screenshot/case evidence (the attached 400/no-cookie screenshots covered the empty-body control case, not NUL-byte `RT-04`); separate direct automated regression is `AUTH-NUL-01` (PR `#140`, carried forward in PR `#160`). Close `#139` only with direct retest evidence or an explicit team decision accepting this documented Minor limitation. |
| **G2 — Sequential Path A Predecessors (Lab 7 S1 `main` + Sprint 2 `main`)** | AC #1, `AGENTS.md §3.6`, Path A | **BLOCKED (PENDING)** | Both predecessor `main` releases remain **PENDING**: (a) Lab 7 Sprint 1 (`sprint1@8b92459` -> `main`, tag, GCP deploy; [Issue #125](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/125) reopened) has not been released to `main`; (b) Sprint 2 (`sprint2@e61b808` -> Lab 7 reconciliation with new Q05 90-min forward migration on `booking_guard_s2()` -> `sprint2 -> main`, tag, GCP deploy; [Issue #120](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/120) reopened) has not been released to `main`. |
| **G3 — Prerequisite Issue `#148` & PR `#160`** | Blocked by `#148` | **SATISFIED (PRE-RECONCILIATION)** | [Issue #148](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/148) is **`CLOSED`** and [PR #160](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/160) merged at `sprint3@08f7590` with green push CI [Run 45446755454](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45446755454) (3/3 PASS). Integrated regression must still be re-run on the new candidate after Sprint 2 `main` reconciliation (Phase 5.2). |
| **G4 — Branch Reconciliation & `sprint3 -> main` Release PR** | AC #2 | **BLOCKED (PENDING)** | Reconciling accepted Sprint 2 `main` into `sprint3` via reviewed PR, re-running full S1 + Lab 7 Q05 (90-min) + S2 + S3 integrated regression, and opening the separate human-reviewed `sprint3 -> main` release PR all remain **PENDING**. |
| **G5 — Authorized Lab 5 GCP CD Deploy, Live Verification & Rollback** | AC #3, AC #4, AC #5 | **BLOCKED (PENDING AUTHORIZATION)** | GCP release authorization (`DEPLOY_ENABLED="true"`, `demo` environment approval) remains **PENDING**. No Cloud Run revision beyond Lab 6 `nuttiew-00012-nob` exists, and no live S1/S2/S3 smoke, negative authorization, or restart/redeploy persistence check on GCP has been executed. |

## 4. Final Mandatory Release Sequence — Path A Only (No Combined S2 + S3 Release)

Path A is **final** and mandatory. Do **not** combine Sprint 2 and Sprint 3 into one release.

1. **Step 1 — Lab 7 Sprint 1 Release (`sprint1 -> main`, Phases 1–3):**
   - Open human-reviewed `sprint1 -> main` release PR (Q05 90-min cutoff + `20261125000000_lab7_q05_min_notice`, zero S2/S3 code), pass 3/3 CI, merge after explicit authorization, create annotated tag (`lab7-s1-q05-90m`), deploy via Lab 5 CD, verify live Q05 `90:00`/`89:59` + S1 flows, refresh Part C metrics, resolve `#139`, and upload Lab 7 PDF to LEB2 (`#125`).
2. **Step 2 — Sprint 2 Reconciliation & Release (`sprint2 -> main`, Phase 4):**
   - Branch from `origin/sprint2@e61b808`, merge accepted Lab 7 `main`, add a **new forward migration** updating only new-Booking Q05 in `booking_guard_s2()` from 60 to 90 minutes (plus `apps/api/src/availability.ts`) while keeping Q07=30, Q10/Q11=60, Q18=60 unchanged, verify fresh + upgrade migrations and full S2 CI via reviewed PR into `sprint2`.
   - Open separate human-reviewed `sprint2 -> main` release PR (zero S3 code), pass CI, merge after explicit authorization, create annotated Sprint 2 tag, deploy via Lab 5 CD, verify live S1+S2 + persistence, and update `#120` and `#149`.
3. **Step 3 — Sprint 3 Reconciliation & Final Release (`sprint3 -> main`, Phase 5):**
   - Branch from `origin/sprint3@08f7590`, merge accepted Sprint 2 `main` via reviewed PR into `sprint3`.
   - Re-run full integrated S1 + Lab 7 Q05 (90-min) + S2 + S3 regression (all 4 summary categories, `evaluatedAt`, count/list parity, owner privacy, 1 μs boundaries, `America/Los_Angeles`/Bangkok display, mobile/keyboard refresh, error/no-stale-data recovery, API restart persistence, clean & upgrade migrations, full CI) and update verification ledger with the new tested SHA and PASS/FAIL/SKIP counts.
   - Open separate human-reviewed `sprint3 -> main` final release PR (`Refs #149`), pass CI, merge after explicit authorization, create annotated Sprint 3 tag, deploy via Lab 5 CD, verify live S1/S2/S3 + restart persistence + rollback evidence, record all evidence on `#149`, and close `#149`.
