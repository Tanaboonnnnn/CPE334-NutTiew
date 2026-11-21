# F-S2-05 — Tutor Slot Withdrawal Software Test Specification (Part E)

> **Planned STS only.** No executable test, PostgreSQL run, browser test or PASS result is included. Execute against the reviewed S2 migrations and record the exact source/schema SHA.

## 1. Traceability and test setup

Sources: [Feature SDS](specification.md), [UI](ui-spec.md), [API](api-spec.md), [data](data-spec.md), [SRS](../../srs.md) (Q26/Q27/Q32, FR-033/034, BR-026/027/032, NFR-004/005, VAL-025..027), [System SDS](../../system-sds.md) (§§7.1, 7.4–7.5) and the Sprint 1 Slot/Booking STS.

Required Part F setup: disposable PostgreSQL 18 at the reviewed S2 schema SHA; active/inactive Tutors, Tutor A/B, Customer A/B; live Sessions; real future `Offered` Slots; a `Booked` Booking for the occupied case; at least two independent DB sessions; synchronized barriers; `pg_backend_pid()`/`pg_blocking_pids()`; a controlled `T_elig` seam for the future rule; fault injection after the Slot update and before COMMIT; a fresh connection for final-row inspection.

All cases below are **PLANNED / NOT RUN**.

## 2. Planned STS cases

| ID | Requirement trace | Setup / action | Expected observable result |
|---|---|---|---|
| WDR-01 | FR-034; BR-027; AC-S2-05-01; VAL-026 | Owner withdraws an own future unoccupied `Offered` Slot. | 200 after COMMIT; exactly one row `Withdrawn` with `withdrawnAt`; history retained; Slot absent from availability. |
| WDR-02 | FR-034; AC-S2-05-02; NFR-001 | Tutor B withdraws Tutor A's Slot; unknown UUID; anonymous; Customer role. | 404 for foreign/unknown with identical body; 401; 403; no mutation, no identity leak. |
| WDR-03 | FR-033; BR-026; AC-S2-05-03; VAL-025 | Withdraw a Slot referenced by a `Booked` Booking. | 409 `SLOT_OCCUPIED`; Booking and Slot unchanged; no partial withdrawal. |
| WDR-04 | FR-034; AC-S2-05-04; NFR-006 | Controlled `T_elig`: Slot start exactly at `T_elig` and just before; a past Slot. | 422 `SLOT_NOT_WITHDRAWABLE`; no change. A strictly future Slot is the control. |
| WDR-05 | BR-032; AC-S2-05-05; VAL-027 | Withdraw twice; attempt `Withdrawn → Offered` directly. | Second request 409 `SLOT_ALREADY_WITHDRAWN`; direct reactivation rejected `P0B04`; same ID never offered again. |
| WDR-06 | BR-027/032; AC-S2-05-06; VAL-026/027 | After withdrawing 13:00–14:00, create a new distinct Slot 13:00–14:00. | New ID accepted if otherwise valid; old withdrawn row retained; GiST exclusion ignores the withdrawn row. |
| WDR-07 | AC-S2-05-07; NFR-004; System SDS §7.5 | Withdrawal versus new Booking on the same Slot, both orders under a barrier. | Final state is only `(Offered + one Booked)` or `(Withdrawn + zero Booked)`; never `Withdrawn + Booked`; loser gets a safe non-success. |
| WDR-08 | AC-S2-05-07; System SDS §7.5 | Start with an **occupied** Slot and race a direct Tutor withdrawal against a legitimate Tutor cancellation of that Booking; force the withdrawal check first and then force Tutor cancellation COMMIT first. | Withdrawal-first is rejected `409 SLOT_OCCUPIED` without changing the Slot; a subsequent valid Tutor cancellation may atomically commit `Cancelled + Withdrawn + one notice`. Cancellation-first commits that same consistent state; the withdrawal then returns `409 SLOT_ALREADY_WITHDRAWN`. No independently successful withdrawal, `Withdrawn + Booked`, missing notice or orphan notice. |
| WDR-09 | AC-S2-05-08; NFR-005 | Inject a DB failure after the Slot update and before COMMIT. | Whole transaction rolls back; Slot remains `Offered` with `withdrawnAt NULL`; safe non-success. |
| WDR-10 | AC-S2-05-09 | Direct SQL: occupied withdrawal, `Withdrawn → Offered`, change Tutor/interval/ID, DELETE, TRUNCATE. | `slot_guard_s2()` rejects each with a non-success SQLSTATE; committed rows unchanged; runtime role cannot disable the trigger. |
| WDR-11 | AC-S2-05-08; NFR-001 | Hold the Slot/User lock, revoke the exact Tutor Session, then release. | Post-wait Session revalidation returns 401; no write. |
| WDR-12 | AC-S2-05-01; NFR-003 | Withdraw, restart the API process against the same DB, re-read the Tutor list and Customer availability. | Withdrawn history persists; availability excludes it; no reactivation. |
| WDR-13 | AC-S2-05-07 | Race a withdrawal with a reschedule into the same Slot. | Reschedule claims the destination or the withdrawal wins; never `Withdrawn + Booked`; loser 409. |
| WDR-14 | AC-S2-05-01 | Inspect the response DTO and the own-list DTO. | `lifecycle='Withdrawn'`, `withdrawnAt` set, `occupancy='Unoccupied'`; no Customer/Booking identity. |

## 3. Required existing-anchor coverage

| Anchor | Planned case |
|---|---|
| VAL-025 | WDR-03 |
| VAL-026 | WDR-01, WDR-06 |
| VAL-027 | WDR-05, WDR-06 |
| FR-033 / BR-026 | WDR-03, WDR-10 |
| FR-034 / BR-027 | WDR-01, WDR-06 |
| BR-032 | WDR-05, WDR-06 |
| NFR-001 | WDR-02, WDR-11 |
| NFR-003 | WDR-12 |
| NFR-004 | WDR-07, WDR-08, WDR-13 |
| NFR-005 | WDR-09, WDR-10 |
| NFR-006 | WDR-04 |
| System SDS §7.5 booking vs withdrawal | WDR-07 |

Feature AC IDs `AC-S2-05-01..09` are new and do not renumber Sprint 1 IDs.

## 4. Part E boundary and Part F evidence

**Part E:** planned cases only; no test has run and no PASS is claimed.

**Part F evidence per run:** case ID; command; source commit; reviewed S2 schema SHA; PostgreSQL version; fixture IDs; backend PIDs/barrier; `T_elig`; expected/actual HTTP; Slot/Booking rows before/after; PASS/FAIL/SKIP with reason. Redact secrets and real user data.

## 5. Independent review checklist

- [ ] Confirm ownership derives from `Slot.tutorId`.
- [ ] Confirm the strict future rule and `T_elig` sampling after locks.
- [ ] Confirm occupied Slots are rejected and the guard independently enforces it.
- [ ] Confirm no same-ID reactivation and retained history.
- [ ] Confirm the withdrawn row does not block a distinct overlapping offer.
- [ ] Confirm races with Booking, reschedule and Tutor cancellation.
- [ ] Confirm no executable test or code is claimed by this Part E document.

**Status:** PLANNED / NOT RUN.
