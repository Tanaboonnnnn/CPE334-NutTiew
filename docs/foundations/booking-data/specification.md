# D1-08A — Shared Booking Data Foundation (Part E)

> **PROPOSED CONTRACT — awaiting human peer review.** Issue [#33](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/33). Contract owner: @Chxtamos. Required peer reviewer / F-S1-04 owner: @Tanaboonnnnn. This Part E change is documentation only. It does not add a Prisma model, migration, endpoint, UI, fixture, or test implementation; it does not claim that any database test has run.

## 1. Purpose and authority

Define one shared, durable PostgreSQL/Prisma Booking representation for:

- [#15 — F-S1-03 Customer Availability](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/15), which reads persisted Bookings to exclude occupied Slots and the authenticated Customer's overlapping appointments.
- [#16 — F-S1-04 Exclusive Booking](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/16), which owns Booking creation, authoritative eligibility, transaction coordination, and retry semantics.

The approved Part E contract for #15 selected Route B: this shared foundation must be reviewed and merged separately before either feature implements Booking-dependent behavior. This document is the proposed contract for that review; it is not itself approval.

Source hierarchy:

1. [Sprint 1 requirements](../../requirements.md): Q01, Q05, Q28, Q30; FR-S1-10..13; BR-S1-08..10, BR-S1-13, BR-S1-19; AC-S1-19, AC-S1-25, AC-S1-26, AC-S1-35; NFR-S1-03..05 and NFR-S1-12.
2. [System SDS](../../system-sds.md): §§3.2–3.3 (entities and native PostgreSQL constraints), §4 (time/state semantics), §§7.1 and 7.3 (lock/transaction responsibilities), §7.5 (real-database verification).
3. [#15 accepted Feature SDS and data contract](../../features/F-S1-03/specification.md) and [data spec](../../features/F-S1-03/data-spec.md), merged by [PR #32](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/32).
4. [#16 issue scope](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/16). Its own Part E contract must still define the Booking API/transaction and OD-013 retry behavior; this foundation does not pre-empt those choices.

## 2. Verified baseline at the Part E branch point

This contract branch is based on `sprint1` commit `98d984169fff6b8ec0ff467c15abb441ca5cadd7` (PR #32 merge).

- `apps/api/prisma/schema.prisma` contains `User`, `Session`, `AuthAttemptBucket`, `AuthAttemptReservation`, and `Slot`; there is no `Booking` model.
- Existing migrations are `20261104000000_auth` and `20261105000000_tutor_slots`; neither creates a Booking table.
- The Auth migration installs `pgcrypto`. The Tutor Slots migration installs `btree_gist`, creates the immutable Sprint 1 Slot table, and enforces same-Tutor Offered-Slot non-overlap.
- `Slot` currently has UUID `id` and `tutorId`, `startsAt`/`endsAt` as `TIMESTAMPTZ(6)`, `lifecycle` defaulting to `Offered`, `createdAt`, and nullable `withdrawnAt`. Sprint 1's Slot trigger rejects ordinary updates/deletes; the current migration does not enable a Withdrawn lifecycle transition.
- `User.role` is persisted as text with the existing Customer/Tutor constraint. A foreign key to `User` alone does not prove that the referenced account has the Customer role or is active; the application must check both using the authenticated principal.
- The System SDS targets PostgreSQL 18.x. No database migration or PostgreSQL compatibility test is executed by this documentation-only PR; the actual database version and `btree_gist` privileges must be recorded during Part F.

Do not edit, squash, replace, or regenerate the existing Auth/Slot migrations as part of this foundation.

## 3. Proposed shared data contract

The canonical field list, relation semantics, SQL constraints, and Prisma mapping are in [data-spec.md](data-spec.md). The core decisions proposed for peer acceptance are:

| ID | Proposed contract | Rationale / trace |
|---|---|---|
| BDF-D01 | `Booking.id` is an immutable UUID primary key. | Stable identity for persistence and later authorized retrieval; FR-S1-10, FR-S1-14. |
| BDF-D02 | `customerId` is a required FK to `User.id`; delete/update is restricted. The service additionally verifies `role = Customer` and `isActive = true` from the authenticated Session. | Preserve ownership and do not trust client identity; FR-S1-04/10, BR-S1-13. |
| BDF-D03 | `currentSlotId` is a required FK to the selected `Slot`. The current Tutor is derived from `Slot.tutorId`; Booking does not duplicate `tutorId`. | Avoid two mutable sources of Tutor ownership; System SDS §3.2. |
| BDF-D04 | Persist `startsAt` and `endsAt` as `TIMESTAMPTZ(6)` snapshots copied from the selected Slot, never accepted from the client. A composite FK `(currentSlotId, startsAt, endsAt) → Slot(id, startsAt, endsAt)` enforces that the snapshot matches the immutable Slot. | Required by System SDS §3.3 and #15 data-spec; prevents a Booking interval drifting away from its Slot. |
| BDF-D05 | `status` is text constrained to exactly `Booked` or `Cancelled`; new Sprint 1 Booking writes begin as `Booked`. Only `Booked` is active/occupying. `Cancelled` is retained for the shared state model and isolated DB tests; no cancellation workflow is added in Sprint 1. | Q30, BR-S1-08/09/10. `Past` is derived display classification, not a status. |
| BDF-D06 | Intervals are valid only when `startsAt < endsAt` and use half-open `[start,end)` semantics. | BR-S1-09/10; adjacent appointments are allowed. |
| BDF-D07 | Parent deletion and primary-key mutation are restricted for both Customer and Slot references. | Preserve Booking history and stable references; no deletion/retention policy is invented. |
| BDF-D08 | PostgreSQL partial unique and exclusion constraints are the final integrity boundary for active Slot exclusivity and Customer overlap. | FR-S1-12/13, BR-S1-08/09/19, NFR-S1-04. |
| BDF-D09 | Add a forward-only migration; current baseline has no Booking rows, so no Booking backfill is required. Existing Auth/Slot data and constraints must remain unchanged. | Safe migration from the verified `sprint1` baseline. |
| BDF-D10 | Store `createdAt` and `updatedAt` as `TIMESTAMPTZ(6)`. `createdAt` is DB-defaulted; Prisma `@updatedAt` maintains `updatedAt` for application updates. These are metadata, not booking eligibility clocks. | Consistent with the System SDS entity model; Q05 continues to use its separate authoritative `T_elig`. |

All BDF-D01..D10 entries are **proposals awaiting review**, not stakeholder decisions or accepted implementation facts. A reviewer-requested change must be reflected in these documents before any migration is authored.

## 4. Integrity and responsibility boundaries

### 4.1 Database-owned invariants

The database must reject:

- missing or invalid Customer/Slot references;
- a non-positive Booking interval or a snapshot that differs from its referenced Slot;
- an unsupported Booking status;
- a second `Booked` row for the same `currentSlotId`;
- any positive-duration overlap between `Booked` intervals belonging to the same `customerId`, including across different Tutors.

`Cancelled` rows do not occupy a Slot and do not participate in the Customer-overlap exclusion. A `Booked` row remains Active after its end time; elapsed time does not cancel or release it.

### 4.2 Application and transaction responsibilities

- #16 derives `customerId` from the live authenticated Session, reads the selected Slot and its actual Tutor from PostgreSQL, copies the persisted Slot interval, and sets the initial status to `Booked`. Client-supplied Customer/Tutor IDs, status, interval, or cutoff timestamps are not authoritative.
- The database FK does not enforce `User.role` or `isActive`; #16 must validate those within its agreed transaction/locking protocol.
- The unique and exclusion constraints protect committed state even when concurrent requests arrive through separate API processes. Application error mapping must treat constraint/serialization conflicts as non-success and must never report a Booking before commit.
- The System SDS §3.3/§7.3 Booking trigger and Q05 `T_elig` requirements remain normative. #16 Part E must explicitly reconcile the trigger/lock order and prove the no-post-guard-contention or full-transaction retry strategy. This foundation does **not** claim that the unique/exclusion indexes alone enforce Q05.
- #15 is read-only: it consumes `status = Booked`, `currentSlotId`, and the persisted interval for availability predicates. It must not create/update Booking records or add `Slot.isBooked`.

### 4.3 Explicit exclusions

No Booking HTTP route/controller/service, UI, private Booking retrieval, cancellation/reschedule operation, `RescheduleHistory`, `Notification`, cancellation actor/reason, idempotency registry, payment, attendance, `Completed` state, or Slot withdrawal workflow is included. OD-013 retry-response semantics remain owned by #16. Issue #15's OD-002 60-day availability horizon is not a Booking column or a change to Q05.

## 5. Migration and compatibility plan

Part F of #33 may begin only after the Part E contract is accepted by both consuming feature owners.

1. Start from the then-current remote `sprint1`; re-check the schema/migration baseline and do not assume this branch's base is still current.
2. Add a new timestamped Prisma migration and matching Prisma model/relations. Do not rewrite or regenerate the existing Auth/Slot migrations.
3. Confirm `btree_gist` is installed and usable by the migration role on the actual target PostgreSQL version. The current Slot migration already installs it; any repeated extension statement must be idempotent and must not drop the extension.
4. Add the Slot composite unique key, Booking table, restrictive foreign keys, checks, lookup indexes, partial unique index, and Customer-range exclusion as agreed in [data-spec.md](data-spec.md).
5. No Booking backfill is needed on the verified baseline because no Booking table or rows exist. Do not fabricate production records or migrate test fixtures into a shared database.
6. Apply migrations to both a fresh disposable database and a disposable database created from the exact current `sprint1` migration chain. Confirm existing Auth/Slot rows and constraints remain intact.
7. Run real PostgreSQL tests from [tests.md](tests.md), including synchronized concurrent transactions and inspection of final committed rows. Record PostgreSQL version, extension version/availability, exact commands, source SHA, and PASS/FAIL/SKIP/BLOCKED results.
8. After the implementation PR is reviewed and merged into `sprint1`, record the exact merged schema commit SHA in Issues #15 and #16. A feature branch must use that accepted SHA before implementing Booking-dependent behavior.

## 6. Peer-review checklist and open integration gate

The required reviewer @Tanaboonnnnn is also the provisional owner of #16, so this review must explicitly confirm that the shared fields/constraints satisfy both #15 and #16. Please review:

- [ ] BDF-D01..D10: field list, status semantics, interval snapshot, timestamps and no duplicated Tutor ownership.
- [ ] Both FK delete/update policies and the composite Slot-window FK.
- [ ] Partial unique index and GiST exclusion semantics, including concurrent writes and adjacent intervals.
- [ ] `btree_gist` availability/permissions on the actual target PostgreSQL deployment.
- [ ] Whether the System SDS Booking trigger/Q05 `T_elig` protocol remains in #16's transaction implementation or requires an agreed database-migration artifact in #33; do not silently omit or duplicate it.
- [ ] No accidental Sprint 2 workflow, API/UI, `Slot.isBooked`, or OD-013 retry decision.

**Open integration gate:** exact ownership and implementation placement for the System SDS Booking trigger / Q05 no-post-guard-contention proof must be reconciled with #16 Part E before the shared migration is accepted. The normative behavior is not optional; only its reviewed implementation boundary remains to be confirmed.

## 7. Traceability

| Foundation invariant | Requirements / tests |
|---|---|
| One active Booking per Slot | FR-S1-12, BR-S1-08/19, AC-S1-25, BDF-10/11 |
| One Customer cannot overlap active intervals across Tutors | FR-S1-13, BR-S1-09/10/19, AC-S1-26, BDF-12/13/14 |
| Slot interval snapshot and valid references | FR-S1-10/16, System SDS §3.3, BDF-05..09 |
| Cancelled is non-occupying; Past is not a state | Q30, BR-S1-30, BDF-04/15 |
| Real DB durability and concurrency evidence | NFR-S1-03/04/05/12, BDF-01..19 |
| Availability read predicates | #15 AVA-02, AVA-15, AVA-16, AVA-17 after the merged schema SHA is recorded |

## 8. Part E Definition of Done

- [ ] The required human peer reviewer has reviewed and accepted the common data shape and invariants for both #15 and #16.
- [ ] Any review changes are incorporated into the contract documents and the final accepted decisions are recorded in the PR.
- [ ] Part F migration work remains a separate reviewed change; no migration or implementation result is claimed by this Part E PR.

Overall Issue #33 remains open until its Part F migration and real-PostgreSQL verification acceptance criteria are completed, reviewed, merged, and the exact schema SHA is published to #15 and #16.
