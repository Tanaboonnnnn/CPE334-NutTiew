# F-S1-04 — Exclusive Booking Feature SDS (Part E)

> **Documentation contract only; not implemented, executed or peer-approved yet.** Issue #16; owner @Chxtamos; independent reviewer @Tanaboonnnnn. This Part E records the user's Sprint 1 Booking decision for OD-013 and selects the PostgreSQL transaction design for review.

## 1. Authority and baseline

Sources: [Sprint 1 requirements](../../requirements.md) (FR-S1-10..13, 16, 18..19; BR-S1-01, 07..13, 18..21; NFR-S1-01, 03..08, 11..12; AC-S1-19..29 and AC-S1-35; VC/TEST-S1-16..27, 33, 38, 39), [SRS](../../srs.md) (Q01/Q02/Q05/Q28..Q30, J-03, OD-013), [System SDS](../../system-sds.md) (§§3.2–3.3, 6, 7.1, 7.3–7.5), [Feature Inventory](../../features.md), and the merged [#33 Foundation SDS](../../foundations/booking-data/specification.md), [data contract](../../foundations/booking-data/data-spec.md) and [BDF STS](../../foundations/booking-data/tests.md).

Accepted dependencies: [Auth #13](../F-S1-01/api-spec.md), [Tutor Slots #14](../F-S1-02/api-spec.md), [Customer Availability #15](../F-S1-03/specification.md).

**Verified branch point:** `sprint1` at `ea36ef6fd3ea7e2c2582489d1326adbd335452ee`. PR #34 is merged at this commit. It accepts #33 **Part E documentation only**, not a Booking schema/migration SHA. #33 Part F must merge and publish its exact schema SHA before #16 Part F implements Booking-dependent code.

**Ownership:** #33 owns the canonical Booking model, migration, constraints, one `booking_guard_s1()` trigger and runtime-role boundary. #16 owns the Booking API/application transaction adapter and post-merge BDF-23. #15 remains read-only; #17 owns protected Booking retrieval. #16 must not duplicate #33's model, migration or trigger.

## 2. Outcome and journey

An authenticated Customer requests one selected Slot. The server derives Customer identity from the live Session, actual Tutor and interval from the persisted Slot, revalidates eligibility under the transaction protocol, and commits one `Booked` row. A new Booking is confirmed only after PostgreSQL acknowledges COMMIT.

1. Customer selects an offer in #15; selection is transient UI state, not a reservation.
2. Customer confirms one selected Slot; the request contains only `slotId`.
3. API authenticates a live Customer Session and derives owner from `principal.userId`.
4. Transaction discovers actual Tutor, acquires User then Slot locks, and checks same-pair replay before new-claim conflicts.
5. New row is inserted through the shared #33 guard; Q05 is decided using DB `T_elig` after the Slot lock.
6. Only after COMMIT does API return 201. A repeated same-Customer/same-Slot request returns 200 and the original Booking ID without another INSERT.
7. Invalid, occupied, overlapping, too-soon, unauthorized or failed attempts never produce false success or partial Booking.

## 3. Scope

**In scope:** Customer-only Booking creation; request/response/error contract; trusted owner derivation; canonical #33 data mapping; PostgreSQL SERIALIZABLE and User → Slot → Booking lock order; bounded full-transaction retry; Q05 and no-post-guard-contention proof; natural-key replay; confirmation/pending/conflict/uncertain UI states; planned STS mapped to existing AC/VC IDs.

**Out of scope:** #33 schema/model/migration/trigger implementation; #15 availability reads; #17 protected Booking list/detail; cancellation, reschedule, withdrawal, notices, payment, attendance, `Completed` or S2/S3 behavior; any Idempotency-Key, registry table, payload fingerprint, replay TTL/window column, new Booking column or new natural-key DB constraint.

## 4. Invariants

| Invariant | F-S1-04 contract |
|---|---|
| Ownership | `customerId = principal.userId` from live active Customer Session; never trust client owner/role. |
| Tutor / Slot | `currentSlotId` is selected persisted Slot. Tutor derives through `Slot.tutorId`; Booking does not duplicate `tutorId`. |
| Interval | Copy persisted Slot `startsAt`/`endsAt`; never accept either timestamp or duration from client. |
| State | New Sprint 1 Booking status is `Booked`; `Past` is display-only and does not release occupancy. |
| Exclusivity | At most one Active (`Booked`) row per Slot. |
| Customer overlap | No positive-duration overlapping Active Bookings for one Customer across Tutors; half-open `[start,end)` means adjacency is allowed. |
| Q05 | At authoritative DB `T_elig`, `Slot.startsAt - T_elig >= 60 minutes`; exact 60:00 passes, 59:59 fails. |
| Atomicity | No success before COMMIT; rejected/aborted attempt leaves no partial Booking or phantom occupancy. |
| Lifecycle | Sprint 1 Booking is append-only; this feature performs INSERT only. |

## 5. Decision record — OD-013, Sprint 1 Booking only

**USER-APPROVED — 7 November 2026:** use **Natural-key idempotency without an Idempotency-Key**. The existing active Booking pair `(authenticated customerId, slotId)` identifies a repeated request:

- First successful creation: **201 Created** with the committed Booking ID.
- Same authenticated Customer submits the same Slot again after a successful commit: **200 OK** with the **original Booking ID**; do not insert a second row.
- Different Customer attempts a Slot already occupied by another Customer: **409 Conflict**, without disclosing the other Customer or Booking.
- Same Customer requests a different Slot that overlaps an existing Active Booking: **409 Conflict**.
- If the first response is lost or COMMIT outcome is unknown, retry the **same POST with the same `slotId`**. If the original row committed, reconcile it and return its original ID.

The pair is an application-level lookup/reconciliation key, **not** a new persisted key or database unique constraint. No key format, registry table, fingerprint or replay TTL is added. The committed #33 Booking row is the durable source of truth. A matching row qualifies for replay only while its status is `Booked`; future cancellation/rebooking behavior is outside this Sprint 1 contract.

This resolves the **Booking-create portion** of SRS OD-013 for F-S1-04. OD-013 remains open for future S2 reschedule/cancel operations until those features have their own reviewed contracts. The decision is recorded in [Issue #16](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/16).

## 6. Engineering selections for peer review

- PostgreSQL **SERIALIZABLE** for every Booking mutation attempt.
- System SDS global lock order: all affected User rows in ascending UUID order → all affected Slot rows in ascending UUID order → existing Booking rows in ascending UUID order only where needed. A new Booking INSERT has no pre-existing Booking row to lock.
- Retry the whole transaction for SQLSTATE `40001`, `40P01` or ORM-equivalent `P2034`; maximum **three total mutation attempts**, with fresh discovery/locks and fresh `T_elig` on every new INSERT attempt.
- `23505`/`23P01` are not blind mutation retries. Roll back, perform one fresh exact-pair read; return 200 only if same Customer/Slot has a committed `Booked` row, otherwise 409.
- #33 trigger uses PostgreSQL `clock_timestamp()` after its Slot lock. Application/browser time, HTTP arrival, transaction-start `now()`, #15 `T_view` and commit time are not authoritative.
- BDF-23 must prove no conflict-capable unique/exclusion wait can occur after `T_elig`, or prove the complete transaction aborts/retries with fresh locks and DB time. A stale-time INSERT that commits after an unaccounted post-guard wait fails the design gate.

These are engineering selections pending independent @Tanaboonnnnn review and real-PostgreSQL proof, not executed results or new stakeholder business rules.

## 7. Acceptance and traceability

| Existing criterion | Contract interpretation | Planned STS |
|---|---|---|
| AC-S1-19 | One eligible request commits one `Booked` row with authenticated Customer, actual Slot/Tutor relationship and copied interval. | BOOK-01 |
| AC-S1-20 and AC-S1-21 | Exact 60:00 passes; 59:59 fails at trigger `T_elig`. | BOOK-02/03 |
| AC-S1-22 | Another Customer cannot claim an occupied Slot; no private owner data is returned. | BOOK-04 |
| AC-S1-23 and AC-S1-24 | Positive same-Customer overlap across Tutors is denied; adjacency is allowed. | BOOK-05/06 |
| AC-S1-25 and AC-S1-26 | Race B (two Customers/one Slot) and Race C (one Customer/two overlapping Tutors) have separate barriers and final-row assertions. | BOOK-10/11 |
| AC-S1-27 / VC-S1-33 | Stale/invalid selection and persistence failure never produce phantom success or inconsistent occupancy. | BOOK-07/08/12/21 |
| AC-S1-28 | Customer/Tutor identity is derived from Session/Slot, not request fields. | BOOK-09 |
| AC-S1-29 / VC-S1-38 | Same-pair replay returns 200 and same Booking ID; unknown outcome is reconciled by retrying same request. | BOOK-13..16 |
| AC-S1-35 / VC-S1-39 | Request arriving before cutoff but waiting until after cutoff is rejected by post-lock DB `T_elig`. | BOOK-17/19 |

Related requirements: FR-S1-10..13, 16, 18..19; BR-S1-01, 07..13, 18..21; NFR-S1-01, 03..08, 11..12; Q01/Q02/Q05/Q28/Q29/Q30; VAL-007..011/014/030. Tests are planned / NOT RUN in Part E.

## 8. Definition of Done

### Part E — specification-only PR

- [ ] Feature SDS, UI, API, data, transaction and STS documents are cross-linked and consistent.
- [ ] User-approved OD-013 Sprint 1 Booking decision is recorded without closing future S2 retry decisions.
- [ ] PostgreSQL SERIALIZABLE, global lock order, bounded whole-transaction retry and Q05 authority are explicit.
- [ ] Same-pair `Booked` replay is checked before occupied/Q05 rejection; returns original ID without INSERT.
- [ ] No-post-guard-contention / BDF-23 is a hard proof gate and is not claimed to have passed.
- [ ] AC-S1-19..29/35 and VC/TEST-S1-16..27/33/38/39 are traceable to planned cases.
- [ ] No Prisma schema, migration, API implementation, UI implementation or executable test is added.
- [ ] Markdown links/structure/IDs and `git diff --check` pass.
- [ ] PR targets `sprint1`, links #16, requests @Tanaboonnnnn and stays open for independent human review.

### Part F — separate implementation PR

Only after Part E acceptance and #33 Part F schema merge: consume exact schema SHA; implement Customer POST/transaction adapter against the one canonical #33 model/guard; TDD authorization/replay/conflict/Q05/Race B/C/rollback; run BDF-23 with real PostgreSQL; record commands, environment, schema/source SHA and actual results; open a separate reviewed code PR into `sprint1`.

**Verification boundary:** Part E is documentation only. No build, migration, application test, API call, browser test or BDF case is claimed as executed.
