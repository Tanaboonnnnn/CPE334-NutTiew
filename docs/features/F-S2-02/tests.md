# F-S2-02 — Customer Reschedule Software Test Specification (Part E)

> **Planned STS only.** No executable test, PostgreSQL run, browser test or PASS result is included. Execute against the reviewed S2 migration and record the exact source/schema SHA.

## 1. Traceability and test setup

Sources: [Feature SDS](specification.md), [UI](ui-spec.md), [API](api-spec.md), [data](data-spec.md), [SRS](../../srs.md) (Q09–Q16/Q28, FR-022..027, BR-009..016, NFR-005/006/007/008, VAL-017..020), [System SDS](../../system-sds.md) (§§7.1, 7.4–7.5) and the Sprint 1 Booking STS.

Required Part F setup: disposable PostgreSQL 18 at the reviewed S2 schema SHA; active/inactive Customers, Customer A/B, Tutor A/B/C; live Sessions; real future `Offered` Slots; Bookings created through the API; at least two independent DB sessions; synchronized barriers; `pg_backend_pid()`/`pg_blocking_pids()`; a controlled `T_elig` seam for boundary cases; fault injection between history INSERT and Booking UPDATE and before COMMIT; a fresh connection for final-row inspection.

All cases below are **PLANNED / NOT RUN**.

## 2. Planned STS cases

| ID | Requirement trace | Setup / action | Expected observable result |
|---|---|---|---|
| RSC-01 | FR-022/025/026; AC-S2-02-01; VAL-017/020 | Owner reschedules a `Booked` Booking to a valid destination with the same Tutor. | 200 after COMMIT; same Booking ID; new `slotId`/interval; original Slot `Offered`/unoccupied; destination occupied; exactly one history row with old/new values and `changedAt`. |
| RSC-02 | FR-024; BR-012; AC-S2-02-02; VAL-019 | Reschedule to a different Tutor's valid offer. | Accepted; same Booking ID; new `tutorId`/`tutorRef`; history old/new Tutor differ; no original-Tutor-only rejection. |
| RSC-03 | FR-023; BR-010/011; AC-S2-02-03; VAL-018; NFR-006 | Controlled `T_elig`: original exactly `T+60:00`, then destination exactly `T+60:00`; separately each at `T+59:59.999`. | Exact boundary on both sides passes; either side just-below returns 422 `RESCHEDULE_WINDOW_CLOSED` with no move/history. |
| RSC-04 | FR-022; BR-009; AC-S2-02-04; NFR-001 | Customer B reschedules A's Booking; unknown Booking; anonymous; Tutor role. | 404 for foreign/unknown with identical body; 401; 403; no mutation, no identity leak. |
| RSC-05 | FR-027; BR-016; AC-S2-02-05; VAL-017 | After one success, attempt a second reschedule; also attempt after a failed destination collision. | Second success rejected 409 `RESCHEDULE_ALREADY_USED`; exactly one history row; the failed attempt left the allowance available. |
| RSC-06 | FR-024; AC-S2-02-06; VAL-019 | Destination is occupied by another Customer; destination is `Withdrawn`; destination Tutor inactive/role-changed. | 409 `SLOT_UNAVAILABLE`; original Booking/Slots/history unchanged. |
| RSC-07 | FR-024; BR-028; AC-S2-02-06 | Destination overlaps the Customer's other `Booked` Booking; adjacent destination as control. | 409 `CUSTOMER_OVERLAP`; adjacent control accepted if other checks pass; no second overlap. |
| RSC-08 | AC-S2-02-05/06 | Destination equals the current Slot. | 409 `RESCHEDULE_NOT_APPLICABLE`; no history, no change. |
| RSC-09 | AC-S2-02-07; NFR-005; VAL-014 | Inject failure after history INSERT, after Booking UPDATE, and before COMMIT in separate runs. | Whole transaction rolls back; original Booking, both Slots and history unchanged; allowance available; safe non-success. |
| RSC-10 | AC-S2-02-08; NFR-004 | Two concurrent reschedules of the same Booking under a barrier. | Exactly one success and one history row; loser 409; no partial move. |
| RSC-11 | AC-S2-02-08; System SDS §7.5 | Reschedule versus Tutor cancellation of the same Booking, both orders. | Exactly one operation commits; if cancel wins, no history and Slot withdrawn; if reschedule wins, former Tutor cannot cancel the moved Booking and no notice is created; never `Withdrawn + Booked`. |
| RSC-12 | AC-S2-02-08; NFR-004 | Reschedule to a destination while another Customer books that destination, both orders. | One wins on the Slot lock; loser 409; no double occupancy. |
| RSC-13 | AC-S2-02-09 | Direct SQL: move `currentSlotId` without history; insert a second history row; UPDATE/DELETE history; change `customerId`; resurrect a Cancelled Booking. | Guard rejects each; committed rows unchanged. |
| RSC-14 | AC-S2-02-10; NFR-007; OD-015 | Inspect responses and accessible views after a cross-Tutor move. | New Tutor sees the Booking; former Tutor does not; no history endpoint, no previous-Tutor identity, no reason/credential/SQL leak. |
| RSC-15 | AC-S2-02-07; OD-013 | Drop the HTTP response after COMMIT, then retry the same request. | Re-read shows the moved Booking; retry returns 409 `RESCHEDULE_ALREADY_USED`; exactly one history row. No success replay is claimed while OD-013 is open. |
| RSC-16 | NFR-003 | Reschedule, restart the API process against the same DB, re-read Booking and availability. | Moved Booking and one history row persist; original offer visible; destination occupied. |

## 3. Required existing-anchor coverage

| Anchor | Planned case |
|---|---|
| VAL-017 | RSC-01, RSC-04, RSC-05 |
| VAL-018 | RSC-03 |
| VAL-019 | RSC-02, RSC-06, RSC-07 |
| VAL-020 | RSC-01, RSC-09, RSC-10 |
| FR-022 / BR-009 | RSC-01, RSC-04 |
| FR-023 / BR-010/011 | RSC-03 |
| FR-024 / BR-012 | RSC-02, RSC-06, RSC-07 |
| FR-025/026/027 / BR-013..016 | RSC-01, RSC-05, RSC-09, RSC-10 |
| NFR-004 | RSC-10, RSC-12 |
| NFR-005 | RSC-09 |
| NFR-006 | RSC-03 |
| NFR-007 / OD-015 | RSC-14 |
| System SDS §7.5 reschedule vs Tutor cancel | RSC-11 |

Feature AC IDs `AC-S2-02-01..10` are new and do not renumber Sprint 1 IDs.

## 4. Part E boundary and Part F evidence

**Part E:** planned cases only; no test has run and no PASS is claimed.

**Part F evidence per run:** case ID; command; source commit; reviewed S2 schema SHA; PostgreSQL version; fixture IDs; backend PIDs/barrier; `T_elig`; expected/actual HTTP; Booking, both Slot rows and history before/after; PASS/FAIL/SKIP with reason. Redact secrets and real user data.

## 5. Independent review checklist

- [ ] Confirm both 60-minute cutoffs use post-lock DB `T_elig`, equality allowed.
- [ ] Confirm same Booking ID and immutable one-row history.
- [ ] Confirm `UNIQUE(bookingId)` plus the transaction enforce the quota.
- [ ] Confirm original Slot stays `Offered` and no Slot write occurs.
- [ ] Confirm destination occupancy/overlap checks exclude the moved Booking.
- [ ] Confirm the shared guard and history-immutability trigger.
- [ ] Confirm OD-013/OD-015 remain open and no history view is invented.
- [ ] Confirm no executable test or code is claimed by this Part E document.

**Status:** PLANNED / NOT RUN.
