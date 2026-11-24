# F-S3-01 Part E readiness gate (S3-00 / #144 & OD-006 / #146)

**Verdict: D2 PAST BOOKED DELIVERED (`#145` / PR `#156`); FINAL `#146` REMAINS GATED ON EXPLICIT `OD-006` DISPOSITION & PART E REVIEW.** The D2 Past Booked increment was merged into `sprint3@175b88d9` with `SUM-01..08` verified (`NutTiew CI` Run `45362315140`). For [#146](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/146), `OD-006` **Option 1** is **PROPOSED** (not approved), and `#146` runtime code remains blocked until all four prerequisites in `## OD-006` below are satisfied.

## Verified baseline and workflow

- Historical audit pin: remote `sprint2` @ `933e385ab6da1a6330fe70917b5f45f58b5b0c89`, the merge of [PR #136](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/136). Its five F-S3-01 documents are [SDS](specification.md), [API](api-spec.md), [UI](ui-spec.md), [Data](data-spec.md), and [STS](tests.md). The [baseline push CI](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45020896983) succeeded; this is existing regression evidence, not a report of executed SUM cases.
- The verified Sprint 2 baseline remains the historical source for this audit. Current Sprint 3 work is developed on `sprint3` and its PRs target `sprint3`; Sprint 2 remains separate on `sprint2`. Follow [AGENTS.md](../../../AGENTS.md). The Sprint 3 Kanban remains [Project #8](https://github.com/users/Tanaboonnnnn/projects/8); the reviewed Sprint 3 SHA and decision evidence are recorded below.
- Sprint 2 implementation merges on the baseline: #129 Customer cancellation (`26ae6ad`), #130 reschedule (`31e5740`), #132 Tutor cancellation (`ee796d7`), #133 private notifications (`02f81ed`), #134 Slot withdrawal (`f0cf44a`). Shared schema: #128 (`d3dbea4`). See [Sprint 2 evidence](../../sprints/sprint2-integration-release-evidence.md); staged integration is not a release.
- [Schema](../../../apps/api/prisma/schema.prisma), [S2 transition constraints](../../../apps/api/prisma/migrations/20261110000000_s2_shared_transition_foundation/migration.sql) and [existing retrieval](../../../apps/api/src/retrieval.ts) verify the required data exists. Authorization is server-derived via live Tutor session → `principal.userId` → current `Booking.currentSlotId` → `Slot.tutorId`. Reschedule transfers current ownership; old Slot history does not grant access to the former Tutor. Cancelled rows retain the relationship and valid actor/time; never serialize the private Tutor reason or raw Customer identity. Withdrawn Slot history and private notifications do not determine summary ownership. No new table, state, or migration needed.
- Lab 6 fix #140 is **not** an ancestor of pinned `sprint2`. The fix was released in [#142](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/142) (verified `main@f94dce9`); [#110](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/110) records partner acceptance separately. Reconcile the Lab 6 correction and its regression into the reviewed Sprint 2 release/integration candidate; do not lose or replace that behavior. Confirm Sprint 2 release diff and then separate Sprint 3 review, regression and release on the reconciled lineage. This is a release gate, not a reason to branch the present audit from `main`, change Lab 6 files, or deploy.

## Contract scope and trace map

[SRS](../../srs.md), [Feature Inventory](../../features.md), [Traceability](../../traceability.md), [System SDS](../../system-sds.md), and the [sprint plan](../../sprints/plan.md) remain source documents. D2 minimum is the real DB-backed Past Booked count/list; it does not meet the complete Final contract. Final requires Upcoming Booked, Past Booked and Cancelled, each with matching lists/counts, plus the approved OD-006 disposition. These cases are **planned**, not implemented or verified by #144.

| Scope | FR / BR / NFR | Feature AC | Planned VAL / SUM |
| --- | --- | --- | --- |
| D2 owner-only Past Booked count/list, deterministic order, current Tutor after reschedule | FR-035/036, BR-030/031/033, NFR-016 | AC-S3-01-01 | VAL-028/029; SUM-01, SUM-06 |
| D2 exact end inclusive, in-progress/upcoming/Cancelled excluded, never Completed | FR-035, BR-030, NFR-006/016 | AC-S3-01-02 | VAL-028/029; SUM-01, SUM-02 |
| D2 role/ownership, empty snapshot and query hygiene | FR-036, BR-031/033, NFR-001/016 | AC-S3-01-03, AC-S3-01-06 | VAL-029/036; SUM-03, SUM-05 |
| D2 DTO allowlist, safe errors | FR-036, BR-033, NFR-007/015 | AC-S3-01-04 | VAL-036; SUM-04 |
| D2 persistence and Bangkok UI | FR-035, BR-031, NFR-003/006 | AC-S3-01-05 | VAL-028; SUM-07, SUM-08 |
| Final Upcoming/Cancelled and approved in-progress treatment, count/list and privacy | FR-035/036, BR-030/031/033, NFR-007/016 | AC-S3-01-07, AC-S3-01-08 | VAL-028/029/036; SUM-09 |
| Final three-category UI, snapshot, empty states, reload | FR-035/036, BR-030/031, NFR-003/006/016 | AC-S3-01-09 | VAL-028/029; SUM-10 |

## OD-006 — In-progress booking classification

**STATUS: PROPOSED OPTION 1 BY `@Chxtamos` (24 Nov 2026 ICT) — NOT YET APPROVED; `#146` RUNTIME CODE REMAINS GATED.**

1. **Decision authority per [SRS §2.1](../../srs.md#21-roles-and-boundaries) and [SRS §13](../../srs.md#13-open-decisions-and-approval-gates):**
   - `SRS §2.1` assigns unresolved policy decisions to **Instructor / product owner**, and `SRS §13` explicitly states for `OD-006`: *"Stakeholder clarifies; peer review before S3 Summary SDS/STS."*
   - Sprint 2 `OD-014` ([PR #131](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/131)) is a team engineering/validation-policy precedent (`meaningful` Tutor cancellation reason) and does **not** automatically grant team-only authority to resolve the `OD-006` stakeholder policy gate.
   - Accordingly, `OD-006` remains **`PROPOSED`** (never marked approved merely by teammate PR review) until either:
     - **(a)** an explicit Instructor/TA stakeholder disposition is recorded, **or**
     - **(b)** documented evidence of delegated team product-owner authority for `OD-006` **plus** explicit written agreement from both students (`@Chxtamos` and `@Tanaboonnnnn`) is recorded — without inventing an unrequired formal instructor-signature gate beyond `SRS §2.1`/`§13`.

2. **Proposed Option 1 boundaries (`sprint3@175b88d985fe2c63028304610e57b1f4ccd47e3d`):**
   - `upcomingBooked`: `status = 'Booked' AND startsAt > evaluatedAt`, ordered `startsAt ASC, id ASC`, `upcomingBookedCount === upcomingBooked.length`, `displayStatus: 'Booked'`.
   - `inProgressBooked`: `status = 'Booked' AND startsAt <= evaluatedAt AND endsAt > evaluatedAt`, ordered `startsAt ASC, id ASC`, `inProgressBookedCount === inProgressBooked.length`, `displayStatus: 'Booked'` (never labeled `Past` or `Completed`; zero new persisted Booking state or migration; rendered explicitly in the Tutor UI via dedicated in-progress count and matching list).
   - `pastBooked`: unchanged (`status = 'Booked' AND endsAt <= evaluatedAt`, ordered `endsAt DESC, id DESC`, `displayStatus: 'Past'`; implemented and merged in [#145](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/145) / [PR #156](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/156)).

3. **Four mandatory gates before starting `#146` runtime code (Issue `#146` AC #1):**
   1. Explicit stakeholder or verified authorized product-owner `OD-006` disposition recorded (per §1 above).
   2. Aligned Part E contracts reflecting that decision across [SDS](specification.md), [API](api-spec.md), [Data](data-spec.md), [UI](ui-spec.md), [STS](tests.md) (explicitly specifying `inProgressBooked` count/list & microsecond start/end boundaries in `SUM-09`/`SUM-10`), [readiness-gate](readiness-gate.md), and [SRS §13](../../srs.md#13-open-decisions-and-approval-gates).
   3. Substantive **actual human teammate peer review** on the Part E contract & STS update (distinct from AI-assisted review).
   4. Merge of the approved contract/decision PR into `sprint3` (tracking the manual GitHub Development link to `#146`).

## OD-009 — Summary query policy

**APPROVED (24 November 2026 ICT).** @Chxtamos [explicitly confirmed OD-009](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/144#issuecomment-7125398026) against `sprint3@fea996d48c7edbbe260a2ce2e9e69ab79537ce0d`. [SRS §13](../../srs.md) records the same decision. The query policy does not decide OD-006 or authorize Final implementation.

- One owner-filtered, read-only and row-preserving PostgreSQL statement, anchored on `statement_timestamp()`. The identical snapshot drives classification, count, list and `meta.evaluatedAt`, even when there are zero real rows. Drop the synthetic null row; return count zero and an empty list. No second timestamp query. Preserve the exact instant at PostgreSQL precision; the [data contract](data-spec.md) uses UTC ISO-8601 microseconds and tests exercise this boundary.
- Current-Tutor ownership via the current Slot on every category; no client ownership/filter/pagination input and no access granted by reschedule history. No exposed raw Customer identity, cancellation reason or internal error data.
- Past: `endsAt DESC, id DESC`; Upcoming and proposed In-Progress: `startsAt ASC, id ASC`; Cancelled: `cancelledAt DESC, id DESC`. Every category count equals its returned list length. No pagination in S3 v1; return the full authorized set. If limits later become necessary, reopen the policy rather than introducing silent truncation.
- The linked decision confirms snapshot and empty-row behavior, deterministic order and ties, no pagination, current ownership, and privacy. It does not represent executable test results.

## Human review and handoff

- **D2 baseline completed:** PR `#136` AI-assisted review was superseded by `@Chxtamos`'s [personal confirmation on #144](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/144#issuecomment-7125398026) (`sprint3@fea996d4`). Issue `#144` was closed, and [#145](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/145) (`D2 Past Booked`) was implemented, verified (`SUM-01..08`, [CI Run 45362315140](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45362315140)), reviewed in [PR #156](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/156), and merged into `sprint3@175b88d9`.
- **Current `#146` handoff state:** PR `#157` updates the Part E contract docs (`SDS`, `API`, `Data`, `UI`, `STS`, `readiness-gate`, `SRS §13`) with the **Option 1** proposal and its authority/multi-step gate. **No `#146` runtime code, migration, or `SUM-09`/`SUM-10` execution is claimed; `SUM-09` and `SUM-10` remain `PLANNED / NOT RUN`** until all four `OD-006` gates above are satisfied and verified.
