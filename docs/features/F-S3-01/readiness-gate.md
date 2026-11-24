# F-S3-01 Part E readiness gate (S3-00 / #144)

**Verdict: D2 PART E AND OD-009 CONFIRMED.** The design supports Past Booked without a migration. [#145](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/145) can begin implementation once this decision record is merged into `sprint3` and #144 is closed. OD-006 remains open for the affected Final classification only.

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

**OPEN, stakeholder decision required.** With `startsAt <= evaluatedAt < endsAt` and persisted `Booked`, the D2 count and list both exclude the appointment from Past Booked. At `endsAt = evaluatedAt` it becomes Past for display only. Never invent a `Completed` state or count it as Past early.

Request a written stakeholder choice through the team: (1) the existing proposal keeps Upcoming strictly future and displays a separate in-progress subgroup/count/list, with no new persisted state, or (2) a specifically approved treatment within the existing categories, e.g. a clearly labeled in-progress subset within Upcoming with matching amended count/list, if the stakeholder accepts that meaning. Neither option has been selected here. Stakeholder decision then teammate review must establish time boundaries, DTO/category naming, UI labeling/counts, and SUM-09/10 in controlled specs. If the SRS's before-contract gate is read as blocking even the unaffected D2 subset, explicitly review the D2/Final split rather than assuming this note waives it. It blocks affected Final classification, not design review of the D2 Past predicate.

## OD-009 — Summary query policy

**APPROVED (24 November 2026 ICT).** @Chxtamos [explicitly confirmed OD-009](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/144#issuecomment-7125398026) against `sprint3@fea996d48c7edbbe260a2ce2e9e69ab79537ce0d`. [SRS §13](../../srs.md) records the same decision. The query policy does not decide OD-006 or authorize Final implementation.

- One owner-filtered, read-only and row-preserving PostgreSQL statement, anchored on `statement_timestamp()`. The identical snapshot drives classification, count, list and `meta.evaluatedAt`, even when there are zero real rows. Drop the synthetic null row; return count zero and an empty list. No second timestamp query. Preserve the exact instant at PostgreSQL precision; the [data contract](data-spec.md) uses UTC ISO-8601 microseconds and tests exercise this boundary.
- Current-Tutor ownership via the current Slot on every category; no client ownership/filter/pagination input and no access granted by reschedule history. No exposed raw Customer identity, cancellation reason or internal error data.
- Past: `endsAt DESC, id DESC`; Upcoming and proposed In-Progress: `startsAt ASC, id ASC`; Cancelled: `cancelledAt DESC, id DESC`. Every category count equals its returned list length. No pagination in S3 v1; return the full authorized set. If limits later become necessary, reopen the policy rather than introducing silent truncation.
- The linked decision confirms snapshot and empty-row behavior, deterministic order and ties, no pagination, current ownership, and privacy. It does not represent executable test results.

## Human review and handoff

- PR #136 records an AI-assisted approval on `8885747`, not personal sign-off. The later [confirmation on #144](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/144#issuecomment-7125398026) records @Chxtamos’s personal review of the SDS, API, UI, Data, STS and readiness record for D2 Past Booked on `sprint3@fea996d48c7edbbe260a2ce2e9e69ab79537ce0d`.
- After this record is merged and #144 is closed, #145 can implement the D2 Past Booked increment. #146 and affected Final classification still require the stakeholder’s documented OD-006 decision. No application code, migrations, cloud changes or release are part of #144; SUM-01..10 are **NOT RUN**.
