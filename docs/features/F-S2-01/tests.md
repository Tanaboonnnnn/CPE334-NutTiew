# F-S2-01 — Customer Cancellation Software Test Specification (Part E)

> **Planned STS only.** No executable test, PostgreSQL run, browser test or PASS result is included. Execute against the reviewed S2 migration and record the exact source/schema SHA.

## 1. Traceability and test setup

Sources: [Feature SDS](specification.md), [UI](ui-spec.md), [API](api-spec.md), [data](data-spec.md), [SRS](../../srs.md) (Q05/Q07/Q08, FR-020/021, BR-007/008, NFR-005/006/007/008, VAL-015/016), [System SDS](../../system-sds.md) (§§7.1, 7.4–7.5) and the accepted Sprint 1 Booking STS.

Required Part F setup: disposable PostgreSQL 18 at the reviewed S2 schema SHA; synthetic active/inactive Customers, Customer A/B, Tutor A/B; live Sessions (including two Sessions for one User); real future `Offered` Slots and `Booked` Bookings created through the API; at least two independent DB sessions; explicit barriers and `pg_backend_pid()`/`pg_blocking_pids()` capture; a controlled mutation clock seam that returns a fixed `T_elig` for boundary cases while production uses `clock_timestamp()`; fault injection between UPDATE and COMMIT. Inspect final committed rows from a fresh connection.

All cases below are **PLANNED / NOT RUN**.

## 2. Planned STS cases

| ID | Requirement trace | Setup / action | Expected observable result |
|---|---|---|---|
| CAN-01 | FR-020/021; AC-S2-01-01; VAL-015 | Owner cancels a `Booked` Booking at `>= 30:00`. | 200 after COMMIT; exactly one row `Cancelled`, actor `Customer`, `cancelledAt` set, `updatedAt` updated; Slot unchanged `Offered`/`withdrawnAt NULL`; occupancy released. |
| CAN-02 | BR-007; AC-S2-01-02; VAL-015; NFR-006 | Controlled `T_elig`: Booking start exactly `T+30:00`, then `T+29:59.999`. | Exact boundary succeeds; just-below returns 422 `CANCELLATION_WINDOW_CLOSED`; no change in the failing case. |
| CAN-03 | FR-020; BR-007; AC-S2-01-03; NFR-001 | Customer B cancels Customer A's Booking; nonexistent UUID; anonymous; Tutor role. | 404 `BOOKING_NOT_FOUND` for foreign and unknown with identical body; 401 anonymous; 403 wrong role; no mutation, no identity leak. |
| CAN-04 | FR-020; AC-S2-01-03 | Cancel an already `Cancelled` Booking, then retry after a lost response. | 409 `BOOKING_NOT_CANCELLABLE`; exactly one committed transition; no duplicate effect. |
| CAN-05 | FR-021; BR-008; AC-S2-01-01 | Cancel a Booking on a Slot still eligible for new Booking (`>=60:00`); inspect the Slot and an authorized availability read. | `lifecycle='Offered'`, `withdrawnAt IS NULL`, `tutorId`/interval unchanged; the eligible offer appears on a fresh availability read; `booking_one_active_per_slot` no longer blocks it. A Slot below the 60-minute new-Booking cutoff is unoccupied but excluded from eligible offers (CAN-06). |
| CAN-06 | FR-021; BR-005/008; AC-S2-01-04; VAL-016 | Cancel when the reopened Slot starts `< 60:00` away; then attempt a new Booking on it. | Slot is unoccupied but the new Booking is rejected 422 `BOOKING_NOT_ELIGIBLE` by the independent Sprint 1 guard; no row. |
| CAN-07 | AC-S2-01-05; NFR-004; System SDS §7.5 | With a Slot starting `>60:00` ahead, race owner cancellation against Customer B's new Booking, forcing (a) contender's occupancy check before cancel COMMIT and (b) cancellation COMMIT before contender's check. Also repeat with a Slot inside Q05's 60-minute window but still within the 30-minute cancel window. | (a) B gets 409 while original is still `Booked`; the owner may subsequently cancel, leaving `(original Cancelled + no new Booked)`. (b) B may succeed only after the cancellation commits and Q05 passes, leaving `(original Cancelled + one new Booked)`. Inside 60 minutes B is denied even after cancel. If cancellation itself fails, the original remains `Booked`. Never two active `Booked`; assert final committed rows and safe non-success for the rejected operation. |
| CAN-08 | AC-S2-01-05 | Two concurrent cancels of the same Booking. | Exactly one transition commits; the other returns 409; one `cancelledAt`; no partial state. |
| CAN-09 | AC-S2-01-06; NFR-005; VAL-014 | Inject a DB failure after the UPDATE and before COMMIT. | Whole transaction rolls back; Booking remains `Booked`; Slot remains occupied; safe non-success. |
| CAN-10 | AC-S2-01-06; NFR-001 | Hold the User/Slot lock, revoke the exact Session, then release. | Post-wait Session revalidation returns 401; no write, no DTO. |
| CAN-11 | AC-S2-01-07; NFR-006; VAL-008/009 analogue | Force a lock wait that crosses the 30-minute boundary before `T_elig`. | The decision uses the post-wait `T_elig`; a request that was eligible on arrival but not after the wait is rejected; no stale decision. |
| CAN-12 | AC-S2-01-08; NFR-007 | Inspect full success/error bodies and logs for anonymous, foreign, wrong-role, cutoff and DB-failure cases. | No Customer/Tutor identity, reason, credential, Session/CSRF data, SQL or stack trace. |
| CAN-13 | AC-S2-01-09 | Direct SQL attempts: second `Booked→Cancelled`, `Cancelled→Booked`, owner/Slot/interval change, DELETE, TRUNCATE. | `booking_guard_s2()` rejects each with a non-success SQLSTATE; committed rows unchanged; runtime role cannot disable the trigger. |
| CAN-14 | NFR-003 | Cancel, restart the API process against the same DB, re-read the Booking and availability. | Cancelled status and reopened offer persist; no in-memory-only state. |

## 3. Required existing-anchor coverage

| Existing anchor | Planned case |
|---|---|
| VAL-015 | CAN-01, CAN-02, CAN-03, CAN-04 |
| VAL-016 | CAN-05, CAN-06 |
| FR-020 / BR-007 | CAN-01..CAN-04 |
| FR-021 / BR-008 | CAN-01, CAN-05, CAN-06 |
| NFR-001 | CAN-03, CAN-10, CAN-12 |
| NFR-004 | CAN-07, CAN-08 |
| NFR-005 | CAN-09, CAN-13 |
| NFR-006 | CAN-02, CAN-11 |
| NFR-007 | CAN-12 |
| System SDS §7.5 customer-cancel vs new-Booking | CAN-07 |

Feature AC IDs `AC-S2-01-01..09` are new Sprint 2 identifiers and do not renumber Sprint 1 `AC-S1-*`.

## 4. Part E boundary and Part F evidence

**Part E:** planned cases only. No test has run, no PostgreSQL result exists and no PASS is claimed.

**Part F evidence per run:** case ID; command; source commit; reviewed S2 schema SHA; PostgreSQL version; fixture IDs; backend PIDs/barrier; `T_elig`; expected/actual HTTP; committed Booking/Slot rows before/after; PASS/FAIL/SKIP with reason. Redact secrets and real user data.

## 5. Independent review checklist

- [ ] Confirm the 30-minute predicate uses post-lock DB `T_elig`, equality allowed.
- [ ] Confirm no Slot write and no notice on this path.
- [ ] Confirm the S2 guard shape and fail-closed direct-SQL cases.
- [ ] Confirm the DTO extension is regression-tested against F-S1-05.
- [ ] Confirm the cancel-versus-new-Booking race asserts committed rows, not only HTTP.
- [ ] Confirm privacy and safe-error coverage.
- [ ] Confirm no executable test or code is claimed by this Part E document.

**Status:** PLANNED / NOT RUN.
