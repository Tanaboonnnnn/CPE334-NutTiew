# D1-08A — Shared Booking Data Test Specification (Part E)

> **PLANNED TESTS ONLY — NOT IMPLEMENTED OR RUN.** These cases are the Part F database verification contract. Passing them requires real PostgreSQL and inspection of committed rows/constraint outcomes; Prisma mocks or HTTP-only assertions are insufficient. See [foundation SDS](specification.md) and [data spec](data-spec.md).

## 1. Test environment and evidence

- Use a disposable PostgreSQL database, not a shared or production database.
- Record `SELECT version()`, server major/minor, installed `btree_gist` extension version, migration role privileges, Node/Prisma versions, migration SHA, source SHA, fixture IDs, exact command, and PASS/FAIL/SKIP/BLOCKED result.
- Run one migration test from an empty database and another from the exact `sprint1` migration chain. Do not use a manually approximated schema.
- Use synthetic Customers and Tutors only. Create actual committed Slot and Booking rows satisfying all FKs/constraints.
- For concurrency tests, use separate PostgreSQL connections and explicit synchronization barriers. `Promise.all` without a controlled interleaving is not sufficient. Inspect the final committed rows after both transactions settle.
- Tests that use a Cancelled Booking must create an isolated test fixture or perform a test-only direct SQL state transition inside the disposable database. This is not a Sprint 1 cancellation API or workflow.
- No test case below is a PASS in this Part E PR.

## 2. Planned database test cases

| ID | Trace | Setup / action | Required observable result |
|---|---|---|---|
| BDF-01 | NFR-S1-12 | Apply the agreed migration chain to an empty disposable PostgreSQL database. | Migration completes; Prisma schema and SQL constraints agree; Booking table, FKs, checks and indexes exist. |
| BDF-02 | NFR-S1-03/12 | Build a disposable database by applying every current `sprint1` migration, then apply the Booking foundation migration. | Upgrade succeeds without manual schema repair. |
| BDF-03 | NFR-S1-03/05 | Compare Auth/Slot rows and schema objects before/after the foundation migration. | Existing User, Session, AuthAttempt and Slot data, triggers, indexes and constraints are preserved; no destructive old-migration edit. |
| BDF-04 | Q30, BR-S1-08 | Insert a valid `Booked` row and a valid `Cancelled` test row with matching real Customer/Slot references. | Both statuses persist exactly; `Booked` is active, `Cancelled` is historical/non-occupying. |
| BDF-05 | Data contract | Insert `startsAt = endsAt` and `startsAt > endsAt`. | Both reject at PostgreSQL `booking_positive_interval`; no row commits. |
| BDF-06 | Data contract | Insert a status outside `Booked`/`Cancelled`. | Reject at `booking_status_check`; no row commits. |
| BDF-07 | FR-S1-10 | Insert with a non-existent `customerId`. | Reject by `booking_customer_fk`; no row commits. |
| BDF-08 | FR-S1-10 | Insert with a non-existent `currentSlotId`/Slot-window reference. | Reject by `booking_current_slot_window_fk`; no row commits. |
| BDF-09 | System SDS §3.3 | Insert a Booking whose `currentSlotId` is real but whose `startsAt` or `endsAt` differs from that Slot. | Reject by the composite Slot-window FK; persisted Slot/Booking data remain unchanged. |
| BDF-10 | FR-S1-12, BR-S1-08 | Sequentially insert two `Booked` rows for the same Slot and different Customers. | First commits; second is rejected by `booking_one_active_per_slot`; exactly one active row remains. |
| BDF-11 | AC-S1-25, NFR-S1-04 | Two Customers concurrently insert a `Booked` row for the same Slot under a barrier. | At most one transaction commits; exactly one active row remains; no two success outcomes or partial claims. |
| BDF-12 | FR-S1-13, BR-S1-09 | One Customer has a `Booked` interval on Tutor A; insert a positive-overlap Booking for a distinct Tutor B Slot. | Second row is rejected by `booked_customer_no_overlap`; first row remains unchanged. |
| BDF-13 | AC-S1-26, NFR-S1-04 | One Customer concurrently inserts Bookings for distinct overlapping Slots owned by two Tutors under a barrier. | At most one overlapping active row commits; final committed state contains no same-Customer overlap. |
| BDF-14 | BR-S1-10 | One Customer has `[13:00,14:00)` and inserts `[14:00,15:00)`. | Both commit if all other constraints pass; exact adjacency is not an overlap. |
| BDF-15 | Q30, #15 AVA-17 | In separate controls: (a) Customer A has a Cancelled row on Slot S and Customer B books Slot S; (b) Customer A has a Cancelled interval on Tutor A and books an overlapping Slot on Tutor B. | Both new Booked rows commit; Cancelled history neither occupies the Slot nor participates in Customer overlap. |
| BDF-16 | Data contract | Attempt to delete a referenced Customer/Slot or mutate a referenced primary key/Slot window. | Operations reject and parent/Booking remain intact. Record the actual guard/constraint: the existing Slot immutability trigger may reject Slot mutations before the composite FK is evaluated; verify the FK definition independently. |
| BDF-17 | #15 AVA-02/15/16/17 | Query persisted rows using `status = 'Booked'`, `currentSlotId`, and half-open interval predicates. | Occupied Slot and same-Customer overlap predicates match actual committed data; adjacent and Cancelled controls are handled correctly. |
| BDF-18 | System SDS §3.3 | Verify `btree_gist` exists and supports the UUID equality/range exclusion migration under the actual migration role. | Extension creation/use succeeds on the recorded target version without dropping an existing extension; missing privilege/version is BLOCKED, not silently skipped. |
| BDF-19 | NFR-S1-12 | Inspect Prisma model, migration SQL, and database catalog after generation/deploy. | Relations/types/indexes match; Prisma schema drift or a generated migration dropping SQL-only partial/exclusion constraints fails the test. |

## 3. Constraint outcome interpretation

Expected PostgreSQL classes for isolated negative cases:

- CHECK violations: SQLSTATE `23514`.
- Foreign-key violations: SQLSTATE `23503`.
- Unique partial-index conflicts: SQLSTATE `23505`.
- Exclusion conflicts: SQLSTATE `23P01`.
- Serializable/deadlock outcomes may surface as `40001` / `40P01` if the accepted transaction strategy uses them; #16 must classify and handle them according to its reviewed contract.

For concurrent cases, do not require one exact error code when PostgreSQL may report a serialization failure under the selected isolation/locking design. The acceptance oracle is the final committed state plus correctly classified non-success for the losing operation.

## 4. Tests owned outside this foundation

| Behavior | Owner / evidence |
|---|---|
| Customer role, active account and Session-derived `customerId` | #16 API/transaction tests; the FK alone does not enforce role. |
| Q05 exact 60:00 / 59:59 and `T_elig` sampled after lock wait | #16 Feature SDS/STS and System SDS §7.3; must prove the required Booking trigger/no-post-guard-contention or whole-transaction retry design. |
| Duplicate/uncertain HTTP request response semantics (OD-013) | #16 Part E decision and #16 API tests; not decided here. |
| Customer availability 60-day horizon and safe response allowlist | #15 AVA tests; OD-002 is confirmed as 60 days in Issue #15. |
| Browser/UI, Bangkok rendering, session switch and accessibility | #15 UI/API/E2E tests; not a database foundation test. |
| Customer/Tutor Booking retrieval and record-level privacy | F-S1-05 owner contract/tests; no retrieval endpoint is added here. |
| Sprint 2 cancellation/reschedule/withdrawal/notification and Slot lifecycle transition triggers | Separate Sprint 2 contracts and migrations; this Part E does not implement them. |

## 5. Part F evidence ledger template

The implementation PR must replace this planned status with actual results; do not copy `PASS` without command output and final database inspection.

| Evidence field | Required value |
|---|---|
| PostgreSQL server | Exact `SELECT version()` output |
| Extensions | `btree_gist` version and migration-role privilege evidence |
| Base schema | Exact `sprint1` migration head SHA |
| Migration | New migration path and SHA |
| Test source | Commit SHA and test file paths |
| Commands | Exact fresh DB, baseline upgrade, and test commands |
| Results | Count of PASS / FAIL / SKIP / BLOCKED; link logs/evidence |
| Concurrency | Barrier setup, connections, final committed rows, losing error classification |
| Review | Human reviewer and accepted schema SHA |

**Part E status:** all BDF-01..BDF-19 are planned. No migration, database test, API, UI, or concurrency result is claimed by this document PR.
