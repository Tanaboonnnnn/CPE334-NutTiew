# F-S2-02 — Customer Reschedule with Atomic History Feature SDS (Part E)

> **Documentation contract only; no application code, migration, executable test, PostgreSQL run or approval is included.** Issue [#114](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/114); owner and independent reviewer are to be assigned by the two-person team. Prepared on `docs/114-s2-contracts` from local `origin/sprint1` @ `41b310c83573e672be8c4189607380d56e598291`; the remote head was **not** re-fetched. Status: **DRAFT FOR HUMAN REVIEW**.

## 1. Authority and baseline

Sources: [SRS](../../srs.md) (Q09–Q16/Q28, FR-022..027, BR-009..016, NFR-005/006/007/008, VAL-017..020), [Feature Inventory](../../features.md), [traceability](../../traceability.md), [System SDS](../../system-sds.md) (§§3.2–3.3, 4, 5, 7.1, 7.4–7.5), [plan](../../sprints/plan.md), and the accepted Sprint 1 Booking/retrieval contracts.

**Verified local facts:** `Booking` has no `tutorId`; the current Tutor derives from `Slot.tutorId` via `currentSlotId`. The composite FK `(currentSlotId, startsAt, endsAt) → Slot(id, startsAt, endsAt)` keeps the copied interval aligned with the destination Slot. `booking_one_active_per_slot` is partial on `status='Booked'`; `booked_customer_no_overlap` is a GiST exclusion on `Booked` rows. `booking_guard_s1()` rejects all Booking UPDATEs, so reschedule needs the reviewed S2 guard replacement. `RescheduleHistory` does **not** exist yet.

**Sprint 1 baseline isolation:** no Sprint 1 endpoint or constraint is redefined. The F-S1-05 DTO extension (`Cancelled`, actor/time/reason) is a Sprint 2 change; reschedule itself returns the existing `Booked` shape with a new `slotId`/interval. Do not deploy over the Lab 6 UAT release.

## 2. Outcome and journey

An authenticated Customer reschedules an own `Booked` Booking **once**, possibly to another Tutor, while keeping the same Booking ID. Both the original appointment and the destination Slot must start at least 60 minutes after the authoritative decision. The original Slot stays `Offered` and becomes unoccupied; the destination becomes occupied; one immutable history row records old/new Tutor, Slot and interval. Any failure leaves every related row at its pre-attempt state and does not consume the one-success allowance.

1. Customer opens an own `Booked` Booking with no existing successful reschedule.
2. Customer selects a destination Slot from availability; selection is transient UI state, not a reservation.
3. Request carries only the destination `slotId`.
4. Server discovers original and destination references for the lock set, then locks Users (Customer, original Tutor, destination Tutor) in ascending UUID order, both Slots, the exact Session, and the Booking.
5. Revalidates ownership, `status='Booked'`, no history, both 60-minute cutoffs at `T_elig`, destination `Offered`/unoccupied, and the Customer's other-Booking overlap excluding the moved Booking.
6. Inserts one `RescheduleHistory` row, then updates the same Booking to the destination interval; both commit together.
7. Only after COMMIT does the API return the same Booking ID with the new Slot/time.

## 3. Scope

**In scope:** one successful reschedule per Booking; cross-Tutor destination; dual 60-minute cutoffs; atomic Booking move + history append; original Slot reopen by releasing occupancy (no Slot write); destination occupancy/overlap enforcement; same Booking ID; response/error contract; lock order, Session revalidation, rollback/retry; the shared S2 guard and `RescheduleHistory` migration requirement; UI and planned STS.

**Out of scope:** Customer cancellation (F-S2-01), Tutor cancellation (F-S2-03), notices (F-S2-04), Slot withdrawal (F-S2-05), more than one reschedule, history display/query endpoints, previous-Tutor visibility policy (OD-015), refunds/payments, `Completed`/attendance, idempotency-key protocol (OD-013), any Slot lifecycle mutation, and deployment.

**No-change layers:** `Slot` rows/guards; `booking_one_active_per_slot`; `booked_customer_no_overlap`; availability projection; auth/CSRF; Tutor schedule read shape (still `Booked`-only).

## 4. Invariants

| Invariant | F-S2-02 contract |
|---|---|
| Ownership | Only `Booking.customerId = principal.userId`; foreign/unknown → 404. |
| State | Only `status='Booked'` and **no** `RescheduleHistory` row may reschedule. |
| Quota | At most one successful reschedule per Booking, enforced by `UNIQUE(bookingId)` on history plus the Booking update in one transaction. Failures append no history and consume nothing. |
| Identity | `Booking.id` and `Booking.customerId` never change. |
| Cutoffs | `Booking.startsAt - T_elig >= 60m` **and** destination `Slot.startsAt - T_elig >= 60m`; equality passes, just-below fails. |
| Cross-Tutor | Destination Tutor may differ; no original-Tutor-only restriction. Destination Tutor must be an active `Tutor`. |
| Destination | Must be `Offered`, unoccupied, and not overlap the Customer's other `Booked` Bookings (the moved Booking is excluded). |
| Original Slot | Stays `Offered`/`withdrawnAt NULL`; occupancy is released by the Booking move. |
| History | Exactly one immutable row with old/new Slot, old/new Tutor, old/new interval and `changedAt`, committed with the move. |
| Atomicity | History insert and Booking update commit or roll back together; no partial move, false history or consumed quota. |
| Concurrency | The Booking row lock serializes same-Booking attempts; the destination Slot lock serializes reschedule-versus-booking/withdrawal. |

## 5. Business rules and cutoff math

- **BR-009:** owner only.
- **BR-010/011:** both starts `>= T_elig + 60m`; exact equality passes.
- **BR-012:** cross-Tutor allowed.
- **BR-013/014:** all-or-nothing; original Slot reopens by releasing occupancy.
- **BR-015:** same Booking ID; history records old/new Tutor, Slot/time, `changedAt`.
- **BR-016:** one success; failures do not consume.
- **BR-030:** `Past` is derived; a `Booked` Booking whose end has passed still occupies its Slot and cannot be rescheduled if its start fails the 60-minute rule.
- Destination in the past or `< 60m` → 422 `RESCHEDULE_WINDOW_CLOSED`; the response does not disclose which side failed.

## 6. State model

| From | Event | Booking | Original Slot | Destination Slot | History |
|---|---|---|---|---|---|
| `Booked`, no history | valid reschedule | same ID, new `currentSlotId`/interval, `Booked` | stays `Offered`, unoccupied | stays `Offered`, occupied | one row |
| `Booked`, no history | any rejection | unchanged | unchanged | unchanged | none |
| `Booked`, has history | second reschedule | unchanged | unchanged | unchanged | none |
| `Cancelled` | reschedule | unchanged | unchanged | unchanged | none |
| `Booked` | Tutor cancel (F-S2-03) | `Cancelled` | `Offered → Withdrawn` | n/a | none |
| `Booked` | Customer cancel (F-S2-01) | `Cancelled` | stays `Offered` | n/a | none |

No `Cancelled → Booked` and no history rewrite.

## 7. Transaction and lock protocol (proposed for review)

1. Authenticate `Customer`; validate path UUID, body exactly `{ "slotId": <uuid> }`, empty query.
2. Non-authoritative discovery: Booking → current Slot/Tutor; destination Slot → Tutor. Build the deduplicated lock set.
3. `BEGIN ISOLATION LEVEL SERIALIZABLE`.
4. Lock `User` rows ascending UUID: owner Customer, original Tutor, destination Tutor. Revalidate Customer active/role; destination Tutor active `Tutor`; missing/changed → abort/retry or safe non-success.
5. Lock `Slot` rows ascending UUID: original and destination. Revalidate the original still matches the Booking reference; destination still matches the discovered Tutor and is `Offered`.
6. Lock the exact `Session`; revalidate `revokedAt IS NULL AND expiresAt > clock_timestamp()`.
7. Lock the `Booking` row; revalidate owner, `status='Booked'`, `currentSlotId` unchanged, and no `RescheduleHistory` row. Missing/foreign → 404; already cancelled → 409; history exists → 409 `RESCHEDULE_ALREADY_USED`.
8. Reject destination equal to the current Slot → 409 `RESCHEDULE_NOT_APPLICABLE` (no state change).
9. Sample `T_elig`; evaluate both 60-minute predicates; fail → 422 `RESCHEDULE_WINDOW_CLOSED`.
10. Check destination has no other `Booked` Booking → 409 `SLOT_UNAVAILABLE`; check the Customer's other `Booked` intervals excluding this Booking → 409 `CUSTOMER_OVERLAP`.
11. `INSERT INTO "RescheduleHistory"` with old/new values and `changedAt=$elig`.
12. `UPDATE "Booking" SET "currentSlotId"=$newSlot, "startsAt"=$newStart, "endsAt"=$newEnd, "updatedAt"=$elig WHERE "id"=$id AND "status"='Booked'`.
13. COMMIT; return the same Booking ID with the destination Slot/time only after commit acknowledgement.
14. Retry `40001`/`40P01`/`P2034`/lock-set-change from fresh discovery, maximum three attempts; `23505`/`23P01` is a business conflict or invariant breach, never success.

**Shared guard requirement:** `booking_guard_s2()` must permit the reschedule shape (`status='Booked'`, `customerId` unchanged, `currentSlotId`/interval changed) only when the destination Slot is `Offered`, the interval matches it, no other `Booked` row occupies it, and a matching `RescheduleHistory` row for this Booking and destination exists. It must reject every other UPDATE, DELETE and TRUNCATE. Exact SQL and trigger order are proven in Part F; see [data-spec](data-spec.md) §4.

## 8. Failure, rollback and retry

- Injected failure after history insert or after the Booking update, before COMMIT, leaves the original Booking, both Slots and history unchanged; the allowance remains available.
- A destination collision (`23505`/`23P01`) rolls back both the history and the move; it is not retried into success.
- A second concurrent reschedule of the same Booking: one wins; the loser sees the history row and returns 409; exactly one history row.
- A concurrent new Booking on the destination wins or loses on the shared Slot lock; the loser gets 409.
- Unknown COMMIT outcome: 503 `MUTATION_OUTCOME_UNKNOWN`; client must re-read; no false success and no second history.
- Session revoked during a wait: 401, no write.

## 9. Security and privacy

- Foreign/unknown Booking → 404 identical body; wrong role → 403; anonymous → 401.
- No disclosure of the original Tutor's or destination Tutor's private data beyond the existing `tutorRef`; no other Customer's identity or Booking.
- The cancellation reason fields are not accepted or returned by reschedule.
- **OD-015:** previous-Tutor historical visibility is not defined. This contract does not add a history endpoint; the old Tutor simply loses the current Booking because it moved. A future history view requires an approved privacy decision.
- CSRF, Origin/Referer and expected Session binding are required.

## 10. Acceptance criteria (feature-level, stable IDs)

| ID | Acceptance criterion |
|---|---|
| AC-S2-02-01 | Owner reschedules a `Booked` Booking with no history to a valid destination; 200; same Booking ID; new `slotId`/interval; original Slot `Offered`/unoccupied; destination occupied; exactly one history row. |
| AC-S2-02-02 | Cross-Tutor destination is accepted; history records old/new Tutor and interval; no original-Tutor-only restriction. |
| AC-S2-02-03 | Both cutoffs are enforced independently at `T_elig`; exact `60:00` passes on both sides; either side at `59:59.999` fails 422 with no change. |
| AC-S2-02-04 | Foreign/unknown Booking → 404; wrong role → 403; anonymous → 401; no mutation. |
| AC-S2-02-05 | A second successful reschedule is rejected 409 `RESCHEDULE_ALREADY_USED`; exactly one history row; failed attempts do not consume the allowance. |
| AC-S2-02-06 | Occupied/withdrawn destination → 409 `SLOT_UNAVAILABLE`; destination overlapping the Customer's other Booking → 409 `CUSTOMER_OVERLAP`; no partial move or history. |
| AC-S2-02-07 | Injected failure or Session revocation leaves original Booking, both Slots and history unchanged; allowance available. |
| AC-S2-02-08 | Concurrent same-Booking reschedules and reschedule-versus-Tutor-cancel commit at most one consistent outcome; no orphan history, withdrawal or notice. |
| AC-S2-02-09 | Direct SQL cannot move the Booking without a matching history row, cannot create a second history row, and cannot change `customerId` or resurrect a cancelled Booking. |
| AC-S2-02-10 | Response/logs expose no third-party identity, reason, credential, SQL or stack trace; previous-Tutor visibility remains unclaimed pending OD-015. |

## 11. Dependencies, open decisions and blockers

- **Depends on:** accepted Booking schema and constraints; reviewed S2 guard migration; new `RescheduleHistory` table; F-S2-02 Part E review; F-S2-03 shared guard coordination.
- **OD-013 (OPEN):** duplicate/uncertain reschedule protocol. This contract fixes the invariant (one history, no false success) but not an idempotency key or original-response replay.
- **OD-015 (OPEN):** previous-Tutor visibility after cross-Tutor move. No history endpoint is authorized.
- **OD-008 (OPEN):** history retention/deletion is not decided.
- **Guard coordination:** F-S2-01/02/03 share one replacement guard; the migration must be designed and reviewed as one coherent change, not three conflicting triggers.

## 12. Definition of Done (for the later implementation Issue)

- Contract and STS reviewed before code.
- Reviewed migration creates `RescheduleHistory`, `UNIQUE(bookingId)`, the shared S2 guard and required FKs/indexes; applied to disposable PostgreSQL 18.
- Real UI → API → DB reschedule journey plus cutoff/ownership/quota/rollback/concurrency cases executed and recorded.
- Sprint 1 regression suite still passes.
- No unfinished Sprint 2 build deployed over the Lab 6 UAT release.

## 13. Independent review checklist

- [ ] Confirm both 60-minute cutoffs use post-lock `T_elig`, equality allowed.
- [ ] Confirm the Booking ID is preserved and history is immutable.
- [ ] Confirm one-success quota is enforced by `UNIQUE(bookingId)` plus the transaction, not only UI.
- [ ] Confirm the original Slot stays `Offered` and no Slot write occurs.
- [ ] Confirm destination occupancy/overlap checks exclude the moved Booking.
- [ ] Confirm the shared guard shape and direct-SQL negative cases.
- [ ] Confirm OD-013/OD-015 remain open and no history endpoint is invented.
