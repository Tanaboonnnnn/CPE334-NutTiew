# D1-08A — Shared Booking Data Test Specification (Part E)

> **PLANNED TESTS ONLY — NOT IMPLEMENTED OR RUN.** Passing these cases requires real PostgreSQL and inspection of committed rows/constraint outcomes; Prisma mocks or HTTP-only assertions are insufficient. **Gate split:** BDF-01..BDF-22 and BDF-24..BDF-26 are the #33 Part F pre-merge foundation gate. BDF-23 is a separate #16 Part F joint integration gate, run only after the #33 migration is merged and its exact schema SHA is recorded; BDF-23 must not block the #33 migration PR merge. See [foundation SDS](specification.md) and [data spec](data-spec.md).

## 1. Test environment and evidence

- Use a disposable PostgreSQL database, not a shared or production database.
- Record `SELECT version()`, server major/minor, installed `btree_gist` extension version, migration-owner and application-runtime role names/privileges, Node/Prisma versions, migration SHA, source SHA, fixture IDs, exact command, and PASS/FAIL/SKIP/BLOCKED result. Never expose credentials.
- Run one migration test from an empty database and another from the exact `sprint1` migration chain. Do not use a manually approximated schema.
- Use synthetic Customers and Tutors only. Create actual committed Slot and Booking rows satisfying all FKs/constraints.
- For concurrency tests, use separate PostgreSQL connections and explicit synchronization barriers. `Promise.all` without a controlled interleaving is not sufficient. Inspect the final committed rows after both transactions settle.
- Tests that use a Cancelled Booking must create an isolated `Cancelled` fixture with a direct INSERT inside the disposable database. Do not use UPDATE or DELETE to create or mutate a fixture, and never TRUNCATE to reset it: the Sprint 1 Booking guards reject these operations. UPDATE/DELETE/TRUNCATE appear only as explicit negative-test actions in BDF-20 and BDF-24/25.
- Verify that the application runtime role is distinct from the migration/table-owner role and is not owner/superuser; it has no UPDATE/DELETE/TRUNCATE or DDL/trigger-management privilege and cannot set `session_replication_role` to bypass triggers.
- No test case below is a PASS in this Part E PR.

## 2. Planned database test cases

| ID | Trace | Setup / action | Required observable result |
|---|---|---|---|
| BDF-01 | NFR-S1-12 | Apply the agreed migration chain to an empty disposable PostgreSQL database. | Migration completes; Prisma schema and SQL constraints agree; Booking table, FKs, checks and indexes exist. |
| BDF-02 | NFR-S1-03/12 | Build a disposable database by applying every current `sprint1` migration, then apply the Booking foundation migration. | Upgrade succeeds without manual schema repair. |
| BDF-03 | NFR-S1-03/05 | Compare Auth/Slot rows and schema objects before/after the foundation migration. | Existing User, Session, AuthAttempt and Slot data, triggers, indexes and constraints are preserved; no destructive old-migration edit. |
| BDF-04 | Q30, BR-S1-14, BR-S1-22 | Insert a valid `Booked` row and a valid `Cancelled` test row with matching real Customer/Slot references; after the Booked interval ends, read the stored state and derived display classification. | Both statuses persist exactly; `Booked` remains the business status after elapsed time, `Past` is display-only, and `Cancelled` is historical/non-occupying. |
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
| BDF-16 | Data contract | Attempt to delete a referenced Customer/Slot or mutate a referenced parent primary key/Slot window. | Operations reject and parent/Booking remain intact. Record the actual guard/constraint: the existing Slot immutability trigger may reject Slot mutations before the composite FK is evaluated; verify the FK definition independently. `Booking.id` mutation is intentionally not a DB test because BDF-D01 defines its immutability at the application boundary only. |
| BDF-17 | #15 AVA-02/15/16/17 | Query persisted rows using `status = 'Booked'`, `currentSlotId`, and half-open interval predicates. | Occupied Slot and same-Customer overlap predicates match actual committed data; adjacent and Cancelled controls are handled correctly. |
| BDF-18 | System SDS §3.3 | Verify `btree_gist` exists and supports the UUID equality/range exclusion migration under the actual migration role. | Extension creation/use succeeds on the recorded target version without dropping an existing extension; missing privilege/version is BLOCKED, not silently skipped. |
| BDF-19 | NFR-S1-12 | Inspect Prisma model, migration SQL, and database catalog after generation/deploy. | Relations/types/indexes match; Prisma schema drift or a generated migration dropping SQL-only partial/exclusion constraints fails the test. |
| BDF-20 | System SDS §3.3; BDF-D11 | In a disposable DB, create a controlled non-`Offered` Slot fixture using privileged setup only, restore normal Slot guards, then use a non-owner DML probe role with INSERT/UPDATE privileges but no DDL/trigger bypass to attempt a direct-SQL `Booked` INSERT against it. Separately, INSERT a valid `Cancelled` fixture for an `Offered` Slot whose start is less than 60 minutes away, then use the same probe role to attempt direct SQL `UPDATE status = 'Booked'` (the `Cancelled → Booked` Q05-bypass case). Also attempt a `Booked → Cancelled` or Slot/window UPDATE as a control. | The trigger rejects the non-`Offered` `Booked` INSERT and rejects **every UPDATE** with SQLSTATE `0A000`, including `Cancelled → Booked` even though Q05 would fail; no row changes state, no moved/active Booking commits, and the original fixture rows remain intact. This proves the guard independently of the #16 API. |
| BDF-21 | Q05; System SDS §§3.3/4; BDF-D11 | In the disposable DB, exercise the Q05 comparison with fixed DB-side `startsAt`/`T_elig` instants at exactly 60:00 and 59:59; separately execute the actual trigger path with the non-owner DML probe role and real PostgreSQL clock; verify it reads `clock_timestamp()` only after the Slot lock, never a caller-supplied time. | The exact comparison accepts 60:00 and rejects 59:59; the trigger integration proves the authoritative time source/order. If the exact-boundary subcase cannot be exercised without bypassing the production decision path, mark that subcase BLOCKED rather than PASS. |
| BDF-22 | System SDS §§3.3/7.1/7.3; BDF-D11 | On independent PostgreSQL sessions, hold the selected Slot row lock in transaction A. Start a direct Booking INSERT using the non-owner DML probe role in transaction B while the Slot has more than 60 minutes remaining, then release A only after the cutoff has passed. Capture both backend PIDs, `pg_blocking_pids`, trigger-observed `T_elig`, SQLSTATE and final rows. | B waits on the Slot lock; after the lock is acquired the trigger samples a fresh `T_elig` and rejects the now-too-late Booking. No row commits. This proves the trigger does not sample Q05 before its own Slot-lock wait. |
| BDF-23 | System SDS §§7.1/7.3; #16 Part E/F; BDF-D11 | **Run only after #33 Part F is merged and its exact schema SHA is recorded.** Run the complete #16 transaction adapter against real PostgreSQL with independent sessions and synchronized same-Slot and same-Customer/cross-Tutor attempts. Instrument lock waits and trigger `T_elig`; include a control that forces an unexpected conflict-capable index/constraint wait. | Prove all conflict-capable waits occur before `T_elig`; otherwise the complete transaction aborts/retries with all locks reacquired and a fresh DB clock. Inspect final committed rows and prove no stale-eligibility success, duplicate claim or partial write. This is a **post-merge joint integration gate**, owned by #16; it is not part of the #33 pre-merge gate (BDF-01..22 and BDF-24..26). |
| BDF-24 | BDF-D12; Sprint 1 append-only contract | Commit a valid `Booked` fixture and confirm its Slot is occupied. Using the actual application runtime role, attempt direct `DELETE FROM "Booking" WHERE id = ...`; then, in a disposable test database, use a non-owner DML probe role with DELETE privilege but no trigger/DDL bypass to exercise the row-level guard. | The runtime role is denied by privilege (`42501`); the probe role is rejected by the `BEFORE DELETE` guard (`0A000`). After rollback and a fresh connection, the committed Booking row still exists and the Slot remains occupied. No cancellation/deletion endpoint is involved. |
| BDF-25 | BDF-D12; Sprint 1 append-only contract | Commit a valid `Booked` fixture and confirm its Slot is occupied. Using the actual application runtime role, attempt `TRUNCATE TABLE "Booking"`; then, in a disposable test database, use a non-owner DML probe role with TRUNCATE privilege but no trigger/DDL bypass to exercise the statement-level guard. | The runtime role is denied by privilege (`42501`); the probe role is rejected by the `BEFORE TRUNCATE` statement guard (`0A000`). After rollback and a fresh connection, the committed Booking row still exists and the Slot remains occupied. This proves the statement guard is not replaced by a row-level DELETE trigger. |
| BDF-26 | BDF-D12; least-privilege deployment boundary | Connect as the configured application runtime role and inspect `current_user`, role attributes/membership, table ownership and effective privileges. Attempt `ALTER TABLE "Booking" DISABLE TRIGGER ALL` and `SET session_replication_role = replica`; inspect whether the role owns the table, is superuser, inherits the migration/owner role, or has DDL/trigger-management privileges. | Runtime role is distinct from the migration/table owner, is not owner/superuser, has no UPDATE/DELETE/TRUNCATE or DDL/trigger-management privileges, cannot disable the guards or set replication-role bypass, and retains only required application SELECT/INSERT access. Any missing separation is BLOCKED, not PASS. |

## 3. Constraint outcome interpretation

Expected PostgreSQL classes for isolated negative cases:

- CHECK violations: SQLSTATE `23514`.
- Foreign-key violations: SQLSTATE `23503`.
- Unique partial-index conflicts: SQLSTATE `23505`.
- Exclusion conflicts: SQLSTATE `23P01`.
- The Sprint 1 Booking row guard raises SQLSTATE `0A000` (`feature_not_supported`) for UPDATE/DELETE and the statement-level TRUNCATE guard raises the same code; BDF-20, BDF-24 and BDF-25 must verify the guards. The application runtime role's denied UPDATE/DELETE/TRUNCATE privileges raise `42501`.
- Serializable/deadlock outcomes may surface as `40001` / `40P01` if the accepted transaction strategy uses them; #16 must classify and handle them according to its reviewed contract.

For concurrent cases, do not require one exact error code when PostgreSQL may report a serialization failure under the selected isolation/locking design. The acceptance oracle is the final committed state plus correctly classified non-success for the losing operation.

## 4. Tests owned outside this foundation

| Behavior | Owner / evidence |
|---|---|
| Customer role, active account and Session-derived `customerId` | #16 API/transaction tests; the FK alone does not enforce role. |
| Booking Offered-state, Q05 database guard and Sprint 1 row-level UPDATE/DELETE prohibition (`BEFORE INSERT OR UPDATE OR DELETE`, 60:00/59:59, Slot-lock wait, `Cancelled → Booked` rejection) | #33 Part F migration and BDF-20..22; all are pre-merge foundation gates and direct-SQL tests must prove the trigger independently of the API. |
| Booking DELETE/TRUNCATE guard and application runtime role boundary | #33 Part F migration/deployment contract and BDF-24..26; pre-merge gates prove actual runtime privilege denial, row/statement trigger rejection and committed occupancy preservation. |
| Application lock order and no-post-guard-contention / full-transaction retry proof | #16 Part E/F and BDF-23; run only after #33 Part F is merged and the schema SHA is recorded. BDF-23 is not a prerequisite for #33 migration merge. |
| `Booking.id` immutability | Application-level invariant only (BDF-D01): #16 generates the ID server-side and accepts no ID replacement. Any future update/reschedule path must prove it preserves the original ID; no DB immutability guard or SQL negative test is claimed by #33. |
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
| Database roles | Application runtime role, migration/table-owner role, role memberships, ownership and effective Booking privileges |
| Destructive-operation proof | DELETE/TRUNCATE runtime denial, guard-probe SQLSTATEs, committed Booking row and occupied Slot after rollback |
| Base schema | Exact `sprint1` migration head SHA |
| Migration | New migration path and SHA |
| Test source | Commit SHA and test file paths |
| Commands | Exact fresh DB, baseline upgrade, and test commands |
| Results | Count of PASS / FAIL / SKIP / BLOCKED; link logs/evidence |
| Concurrency | Barrier setup, connections, final committed rows, losing error classification |
| Review | Human reviewer and accepted schema SHA |

**Part E status:** BDF-01..BDF-26 are planned, with the execution split above. #33 Part F must pass BDF-01..BDF-22 and BDF-24..BDF-26 before its migration PR merges; #16 Part F runs BDF-23 after the merged schema SHA exists. No migration, database test, API, UI, or concurrency result is claimed by this documentation-only PR.
