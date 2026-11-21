# F-S2-03 — Tutor Cancellation Software Test Specification (Part E)

> **Planned STS only.** No executable test, PostgreSQL run, browser test or PASS result is included. Execute against the reviewed S2 migrations and record the exact source/schema SHA.

## 1. Traceability and test setup

Sources: [Feature SDS](specification.md), [UI](ui-spec.md), [API](api-spec.md), [data](data-spec.md), [SRS](../../srs.md) (Q17–Q23, FR-028..030, BR-017..020/026, NFR-005/006/007, VAL-021..023, OD-014), [System SDS](../../system-sds.md) (§§7.1, 7.4–7.5) and the Sprint 1 Slot/Booking STS.

Required Part F setup: disposable PostgreSQL 18 at the reviewed S2 schema SHA; active/inactive Tutors, Tutor A/B, Customer A/B; live Sessions; real future `Offered` Slots and `Booked` Bookings created through the API; at least two independent DB sessions; synchronized barriers; `pg_backend_pid()`/`pg_blocking_pids()`; a controlled `T_elig` seam for boundary cases; fault injection after each of the three writes and before COMMIT; a fresh connection for final-row inspection.

All cases below are **PLANNED / NOT RUN**.

## 2. Planned STS cases

| ID | Requirement trace | Setup / action | Expected observable result |
|---|---|---|---|
| TCAN-01 | FR-028/030/031; AC-S2-03-01; VAL-021/022/023 | Assigned Tutor cancels a `Booked` Booking at `>= 60:00` with a valid reason. | 200 after COMMIT; Booking `Cancelled` actor `Tutor` with reason; Slot `Withdrawn` with `withdrawnAt`; exactly one `TutorCancelled` notice for the owning Customer; all committed together. |
| TCAN-02 | BR-018; AC-S2-03-02; VAL-021; NFR-006 | Controlled `T_elig`: Booking start exactly `T+60:00`, then `T+59:59.999`. | Exact boundary succeeds; just-below returns 422 `CANCELLATION_WINDOW_CLOSED`; no Booking/Slot/notice change. |
| TCAN-03 | BR-017; AC-S2-03-03; NFR-001 | Tutor B cancels Tutor A's Booking; unknown Booking; anonymous; Customer role. | 404 for foreign/unknown with identical body; 401; 403; no mutation, no Customer identity leak. |
| TCAN-04 | FR-029; BR-020; AC-S2-03-04; OD-014 | Reason absent, `""`, `"   "`, and a non-string. | 400 `INVALID_INPUT`; no Booking/Slot/notice change; no invented length rule claimed. |
| TCAN-05 | AC-S2-03-05 | Retry Tutor cancellation after a successful Tutor cancellation; separately retry it against an already Customer-cancelled Booking. | Both return 409 `BOOKING_NOT_CANCELLABLE` without Slot change. Tutor-cancelled Booking keeps exactly its one existing notice; Customer-cancelled Booking keeps **zero** Tutor-cancellation notices. No new notice is created on either retry. |
| TCAN-06 | AC-S2-03-06; NFR-005; VAL-022 | Inject failure after Booking update, after Slot withdrawal, and after notice insert, in separate runs. | Whole transaction rolls back; Booking `Booked`, Slot `Offered`, zero notices; safe non-success. |
| TCAN-07 | AC-S2-03-07; System SDS §7.5 | Tutor cancel versus Customer cancel of the same Booking, both orders. | One `Cancelled` transition; notice only if Tutor path committed; Slot `Offered` if Customer won, `Withdrawn` if Tutor won; never `Withdrawn + Booked`. |
| TCAN-08 | AC-S2-03-07; System SDS §7.5 | Tutor cancel versus reschedule to another Tutor, both orders. | Exactly one wins; if reschedule wins, former Tutor gets 404 and no notice/withdrawal; if cancel wins, no history and Slot withdrawn. |
| TCAN-09 | AC-S2-03-08; VAL-026/027 analogue | After withdrawal, attempt to book the Slot, reactivate it, or create a same-ID offer; create a distinct overlapping Slot. | Book/reactivate rejected; distinct new Slot allowed if otherwise valid; old history preserved. |
| TCAN-10 | AC-S2-03-09 | Direct SQL: withdraw an occupied Slot; `Withdrawn → Offered`; change Slot ID/Tutor/interval; DELETE; TRUNCATE; second notice insert. | `slot_guard_s2()`/`notification` guard rejects each with a non-success SQLSTATE; committed rows unchanged. |
| TCAN-11 | AC-S2-03-10; NFR-007 | Inspect Tutor schedule, Customer notice/detail, other-Customer and other-Tutor responses, and logs. | Reason visible only to the owning Customer; no Customer identity in the Tutor response; no reason in logs; no credential/SQL/stack leak. |
| TCAN-12 | AC-S2-03-06; NFR-001 | Hold the Slot/User lock, revoke the exact Tutor Session, then release. | Post-wait Session revalidation returns 401; no write, no notice. |
| TCAN-13 | AC-S2-03-09 | Direct SQL attempts to insert a `Cancelled` Booking without actor/reason or with a blank reason. | `booking_guard_s2()`/CHECK rejects; no invalid row. |
| TCAN-14 | NFR-003 | Cancel, restart the API process against the same DB, re-read the Booking, Slot and notice. | Cancelled status, Withdrawn Slot and durable notice persist. |

## 3. Required existing-anchor coverage

| Anchor | Planned case |
|---|---|
| VAL-021 | TCAN-01, TCAN-02, TCAN-03, TCAN-04 |
| VAL-022 | TCAN-01, TCAN-06, TCAN-09 |
| VAL-023 | TCAN-01, TCAN-07, TCAN-11 |
| FR-028 / BR-017/018 | TCAN-01, TCAN-02, TCAN-03 |
| FR-029 / BR-020 | TCAN-04, TCAN-13 |
| FR-030 / BR-019 | TCAN-01, TCAN-09 |
| FR-031 / BR-021..023 | TCAN-01, TCAN-07, TCAN-11 |
| NFR-001 | TCAN-03, TCAN-12 |
| NFR-005 | TCAN-06, TCAN-10 |
| NFR-006 | TCAN-02 |
| NFR-007 | TCAN-11 |
| System SDS §7.5 Tutor-cancel races | TCAN-07, TCAN-08 |

Feature AC IDs `AC-S2-03-01..10` are new and do not renumber Sprint 1 IDs.

## 4. Part E boundary and Part F evidence

**Part E:** planned cases only; no test has run and no PASS is claimed.

**Part F evidence per run:** case ID; command; source commit; reviewed S2 schema SHA; PostgreSQL version; fixture IDs; backend PIDs/barrier; `T_elig`; expected/actual HTTP; Booking, Slot and Notification rows before/after; PASS/FAIL/SKIP with reason. Redact secrets, reasons from logs and real user data.

## 5. Independent review checklist

- [ ] Confirm assignment derives from `Slot.tutorId`.
- [ ] Confirm the 60-minute boundary uses post-lock DB `T_elig`, equality allowed.
- [ ] Confirm reason trim/nonblank only and OD-014 remains open.
- [ ] Confirm Booking-cancel → Slot-withdraw → notice order and atomic rollback.
- [ ] Confirm `slot_guard_s2()` rejects occupied withdrawal and reactivation.
- [ ] Confirm exactly one notice and its privacy.
- [ ] Confirm races with Customer cancel and reschedule.
- [ ] Confirm no executable test or code is claimed by this Part E document.

**Status:** PLANNED / NOT RUN.
