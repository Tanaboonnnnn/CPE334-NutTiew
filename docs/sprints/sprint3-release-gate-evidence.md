# Sprint 3 Release-Gate Audit & Readiness Ledger (Issue #149 / S3-05)

> **VERDICT: `BLOCKED` FOR `sprint3 -> main` RELEASE MERGE & GCP CLOUD RUN DEPLOYMENT (25 Nov 2026 ICT).**
> This document records live, verified repository, CI, Lab 6 UAT, and Sprint 2 release-gate evidence for [Issue #149](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/149) per AC #5 (*"if gated, document BLOCKED rather than claim released"*). It does **not** merge to `main`, tag a release, alter Lab 6 or Sprint 2 environments, or run any GCP Cloud Run / IAM / billing / secret / production DB change.

## 1. Verified Remote Heads & Git Ancestry (25 Nov 2026 ICT)

| Branch / Target | Verified Remote SHA | Current Role / Status |
|---|---|---|
| `origin/main` | `f94dce99af198b225aafb54bfbf46da420836f35` | Live Lab 6 / Sprint 1 release (`PR #142`, merged 23 Nov 2026; deployed Cloud Run revision `nuttiew-00012-nob`, [CD Run 45212589215](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45212589215)). **Contains Sprint 1 + Lab 6 only — zero Sprint 2 or Sprint 3 code.** |
| `origin/sprint2` | `e61b8085da9006c96baf8fdd768d833b8684be24` | Verified Sprint 2 integration candidate (`PR #153` branch separation). **Not yet reconciled with `main@f94dce9` and never merged/released to `main`.** |
| `origin/sprint3` | `08f759084ebc0cfccb2c9055845f826c02fd44ab` | Verified Sprint 3 integration candidate (`PR #160` `#148` merge). Push CI [Run 45446755454](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45446755454) **PASS 3/3** (`Unit / types / build` `138632520513`, `PostgreSQL 18 / Auth / Slot / Race A` `138632520750`, `Microsoft Edge / Auth / Tutor UI E2E` `138632519618`). |
| Remote Git Tags (`origin`) | *(none)* | `git ls-remote --tags origin` returned 0 tags; no Sprint 2 or Sprint 3 release tag exists. |

### Git Ancestry Checks (`git merge-base --is-ancestor`)

- `origin/main` ancestor of `origin/sprint2`: **NO** (exit `1`) — 27 commits on `main` (including Lab 6 PRs `#137`, `#138`, `#140`, `#141`, `#142`, `#143` and prior `sprint1 -> main` merge commits) are absent from `origin/sprint2`.
- `origin/main` ancestor of `origin/sprint3`: **NO** (exit `1`) — the same 27 commits on `main` are not ancestors of `origin/sprint3` (note: PR `#160` carried forward the `#139`/`#140` runtime fix and `AUTH-NUL-01` test into `sprint3`, but Lab 6 documentation/triage commits under `docs/lab6/*` remain on `main` only).
- `origin/sprint2` ancestor of `origin/sprint3`: **NO** (exit `1`) — diverged when PR `#153` separated Sprint 2 from Sprint 3 docs.

## 2. Integrated Sprint 3 Candidate Register (`origin/sprint3@08f75908`)

| PR | Issue | Scope | Merge Commit (`sprint3`) | Verified CI Evidence |
|---|---|---|---|---|
| [#154](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/154) | #144 | Sprint 3 branch separation & Part E readiness | `fea996d` | Merged & verified on `sprint3` |
| [#156](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/156) | #145 | D2 Past Booked vertical slice (`SUM-01..08`) | `175b88d` | [Run 45362315140](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45362315140) (3/3 PASS) |
| [#157](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/157) | #146 | `OD-006` Option 1 decision record, Part E/SRS sync & `SUM-08b` stabilization | `fcaae4e` | [Run 45402851017](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45402851017) (3/3 PASS) |
| [#158](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/158) | #147 | Owner-only Cancelled Tutor summary (`AC-S3-01-08`) | `a68eca4` | [Run 45419585456](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45419585456) (3/3 PASS) |
| [#159](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/159) | #146 | Upcoming & In-Progress Tutor summary (`AC-S3-01-07/09`) | `2702787` | [Run 45439725513](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45439725513) (3/3 PASS) |
| [#160](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/160) | #148 | Integrated 4-category DB/restart/E2E verification + Lab 6 `#139`/`#140` reconciliation | `08f7590` | PR [Run 45445357326](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45445357326) (3/3 PASS); push [Run 45446755454](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45446755454) (3/3 PASS) |

See [verification-148.md](../features/F-S3-01/verification-148.md) for the `#148` requirement-to-test matrix.

## 3. Release Gate Audit Against Issue #149 Acceptance Criteria

| Gate | Issue #149 AC / Rule | Status | Verified Evidence / Exact Blocker |
|---|---|---|---|
| **G1 — Lab 6 UAT Acceptance & Defect Closure** | AC #1 | **VERIFIED WITH RECORDED CAVEAT** | [Issue #110](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/110) (`CLOSED`, [comment-7110865094](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/110#issuecomment-7110865094)) records two-way acceptance: `PEW-DIY (TH-056_P2) -> NutTiew: Accepted` on `nuttiew-00012-nob` (`main@f94dce9`, [CD Run 45212589215](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45212589215/job/137825262880)), with `RT-01..03` supported by screenshots and `RT-04` partner-reported PASS without direct case screenshot (corroborated separately by automated `AUTH-NUL-01` in PR `#140` and carried forward into `sprint3@08f7590` via PR `#160`); `NutTiew -> PEW-DIY: Accepted with Minor limitations`. |
| **G2 — Reviewed Sprint 2 `main` Release** | AC #1, `AGENTS.md §3.6` | **BLOCKED** | Although [Issue #120](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/120) is `CLOSED`, `origin/main` remains at `f94dce9` (PR `#142`, Sprint 1 + Lab 6). No human-reviewed `sprint2 -> main` release PR, no Sprint 2 merge commit on `main`, no Sprint 2 release tag, and no Sprint 2 Cloud Run deployment exist (see also [sprint2-integration-release-evidence.md](sprint2-integration-release-evidence.md) §6). Per AC #1 (*"do not treat closed Issues as proof"*) and `AGENTS.md §3.6`, Sprint 3 release to `main` is blocked until Sprint 2 is released first or both teammates explicitly record a written sequencing override. |
| **G3 — Prerequisite Issue `#148` Closure** | Blocked by `#148` | **PENDING CLOSURE** | PR `#160` merged at `08f7590` and push CI [Run 45446755454](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45446755454) passed 3/3, but [Issue #148](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/148) remains `OPEN` (Project `#8`: `PR Review \| PR Review`). |
| **G4 — Reconciled `main` Lineage & Release PR** | AC #2 | **BLOCKED (by G2/G3)** | Because `origin/main@f94dce9` is not an ancestor of `origin/sprint2` or `origin/sprint3`, opening a release PR to `main` without first reconciling `main`'s 16 Lab 6 docs/triage/fix commits risks merge conflicts or dropping `docs/lab6/*` provenance. |
| **G5 — Authorized Lab 5 CD Deploy, Live Verification & Rollback** | AC #3, AC #4, AC #5 | **BLOCKED / NOT RUN** | `.github/workflows/deploy.yml` triggers automatically on `push` to `main` (fail-closed behind repository variable `DEPLOY_ENABLED == "true"` and `demo` environment approval). No deployment authorization has been granted, no Cloud Run revision beyond `nuttiew-00012-nob` exists, and no live S1/S2/S3 smoke, negative authorization, or restart/redeploy persistence check on GCP has been executed. Recorded rollback baseline for the currently deployed Lab 6 service: `nuttiew-00012-nob` (`main@f94dce9`). |

## 4. Safe Unblock Sequence (Requires Explicit Team Decision)

Do **not** open or merge a `sprint3 -> main` PR or trigger `.github/workflows/deploy.yml` until the team executes one of the two documented paths below:

### Path A — Strict `AGENTS.md §3.6` Sequential Release (Recommended)
1. Confirm and close [Issue #148](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/148) (update Project `#8` `#148` to `Done`, referencing merged PR `#160` `08f7590` and push CI `45446755454`).
2. Reconcile `origin/main@f94dce9` into `sprint2` via a human-reviewed PR (preserving `docs/lab6/*` + `#139` auth fix, verifying zero Sprint 3 code leaks into `sprint2`, and passing 3/3 CI).
3. Open a human-reviewed `sprint2 -> main` release PR, verify green CI, obtain teammate approval, merge to `main`, and tag the accepted Sprint 2 release.
4. Reconcile the updated `main` into `sprint3` via a human-reviewed PR (preserving S1 + S2 + S3 + Lab 6 docs/fix), verify 3/3 CI, and open the human-reviewed `sprint3 -> main` final release PR (`Refs #149`).
5. Only after explicit team authorization (`DEPLOY_ENABLED`, `demo` approval), run `.github/workflows/deploy.yml` on `main` (applying `20261110000000_s2_shared_transition_foundation` safely to the target PostgreSQL instance), record the release tag/commit, Cloud Run revision, service URL, live S1/S2/S3 + negative auth smoke tests, DB persistence across restart/redeploy, and verified rollback revision.

### Path B — Explicitly Approved Combined S2 + S3 `main` Release (Requires Written Two-Student Override)
1. Close [Issue #148](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/148) after confirming push CI `45446755454`.
2. Both `@Chxtamos` and `@Tanaboonnnnn` explicitly confirm in writing on [Issue #149](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/149) that a separate Sprint 2 `main` release is waived in favor of a single combined S2 + S3 release on `main` (keeping `sprint2` preserved separately for historical traceability).
3. Reconcile `origin/main@f94dce9` into `sprint3` via a human-reviewed PR (preserving `docs/lab6/*` and `#139` fix alongside S1/S2/S3), pass 3/3 CI, then open the human-reviewed `sprint3 -> main` release PR (`Refs #149`) and complete Step 5 above after explicit deployment authorization.
