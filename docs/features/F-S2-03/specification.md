# F-S2-03 — Tutor Cancellation with Reason and Slot Withdrawal Feature SDS (Part E)

> **Documentation contract only; no application code, migration, executable test, PostgreSQL run or approval is included.** Issue [#114](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/114); owner and independent reviewer are to be assigned by the two-person team. Prepared on `docs/114-s2-contracts` from local `origin/sprint1` @ `41b310c83573e672be8c4189607380d56e598291`; the remote head was **not** re-fetched. Status: **DRAFT FOR HUMAN REVIEW**.

## 1. Authority and baseline

Sources: [SRS](../../srs.md) (Q17–Q23, FR-028..030, BR-017..020/026, NFR-005/006/007, VAL-021..023, OD-014), [Feature Inventory](../../features.md), [traceability](../../traceability.md), [System SDS](../../system-sds.md) (§§3.2–3.3, 4, 5, 7.1, 7.4–7.5), [plan](../../sprints/plan.md), and the accepted Sprint 1 Slot/Booking contracts.

**Verified local facts:** `Slot.lifecycle` already allows `Withdrawn` with `slot_lifecycle_consistent` (`withdrawnAt` required); `slot_guard_s1()` currently raises `23514` on every UPDATE, so Tutor cancellation cannot withdraw a Slot until a reviewed forward migration installs an S2 Slot guard. `booking_guard_s1()` rejects Booking UPDATEs, so the shared `booking_guard_s2()` is also required. There is **no** `Notification` table yet. `Booking` has no `tutorId`; the assigned Tutor is `Slot.tutorId` through `currentSlotId`.

**Sprint 1 baseline isolation:** no Sprint 1 endpoint, DTO or constraint is redefined. The new Slot withdrawal capability is S2-only and must not be enabled over the Lab 6 UAT release.

## 2. Outcome and journey

An authenticated Tutor cancels an Active Booking currently assigned to them when its start is at least 60 minutes away and a meaningful nonblank reason is supplied. In one transaction the Booking becomes `Cancelled` (actor `Tutor`, reason stored), the original Slot becomes `Withdrawn` (not reopened), and one private notice is created for the owning Customer. Any failure leaves Booking, Slot and notices unchanged.

1. Tutor opens their authorized schedule and selects a `Booked` appointment at least 60 minutes away.
2. Tutor enters a reason and confirms cancellation.
3. Request carries only the Booking ID and reason; no Tutor ID, Customer ID, status or time.
4. Server discovers the current Slot/Customer, locks Users (Tutor + Customer), the Slot, the exact Session and the Booking.
5. Revalidates the currently assigned Tutor, `status='Booked'`, the 60-minute cutoff at `T_elig`, and the nonblank reason.
6. Updates the Booking to `Cancelled`; withdraws the Slot (`Offered → Withdrawn`, `withdrawnAt=T_elig`); inserts one `TutorCancelled` notice for the Customer; commits.
7. Only after COMMIT does the API return the Tutor-scoped Cancelled result. The Customer reads the notice/reason in F-S2-04.

## 3. Scope

**In scope:** Tutor-only cancellation of a currently assigned `Booked` Booking; 60-minute cutoff; required meaningful reason; atomic Booking cancel + Slot withdrawal + private notice; response/error contract; lock order, Session revalidation, rollback/retry; the shared Booking guard and new Slot-withdrawal guard; UI and planned STS.

**Out of scope:** Customer cancellation (F-S2-01), reschedule (F-S2-02), notice read UI (F-S2-04), Tutor withdrawal of an unoccupied Slot (F-S2-05), refunds/payments, `Completed`/attendance, retention/deletion (OD-008), exact reason length/vocabulary policy (OD-014), idempotency protocol (OD-013), deployment.

**No-change layers:** Slot creation/availability/booking INSERT paths; `slot_exactly_one_hour`; `offered_slot_no_overlap_per_tutor`; `booking_one_active_per_slot`; `booked_customer_no_overlap`; auth/CSRF.

## 4. Invariants

| Invariant | F-S2-03 contract |
|---|---|
| Assignment | Only the Tutor currently assigned through `Booking.currentSlotId → Slot.tutorId = principal.userId`; foreign/unknown → 404. |
| Role | Live active `Tutor` Session; a Customer or inactive Tutor is rejected. |
| State | Only `status='Booked'`; `Cancelled` is terminal. |
| Cutoff | `Booking.startsAt - T_elig >= 60 minutes`; equality passes, just-below fails. |
| Reason | Trimmed reason must be nonempty; stored only on a Tutor cancellation; never exposed to third parties. |
| Booking outcome | `Cancelled`, `cancellationActor='Tutor'`, `cancelledAt=T_elig`, reason stored. |
| Slot outcome | `Withdrawn`, `withdrawnAt=T_elig`; never reopened; not bookable again under the same ID. |
| Notice | Exactly one private `TutorCancelled` notice for `Booking.customerId`, committed with the cancellation. |
| Atomicity | Booking, Slot and notice commit or roll back together; no partial withdrawal/cancellation/notice. |
| Concurrency | Slot and Booking locks serialize against Customer cancel, reschedule, new Booking and withdrawal. Final state is never `Withdrawn + Booked`. |

## 5. Business rules and cutoff math

- **BR-017:** only the currently assigned authorized Tutor.
- **BR-018:** `startsAt - T_elig >= 60m`; equality passes.
- **BR-019:** withdraw the original Slot; do not reopen.
- **BR-020:** meaningful nonblank reason; empty/whitespace-only rejected.
- **FR-030:** no partial outcome; trace/history preserved.
- **FR-031 (notice creation):** one private notice with the reason for the owning Customer.
- **OD-014 (OPEN):** the exact definition of "meaningful" beyond nonblank and any length limit is not approved. This contract fixes only: trim, reject empty, store a nonblank string. A **PROPOSED** maximum of 500 Unicode code points may be used for implementation review, but it is not an approved stakeholder rule.

## 6. State model

| From | Event | Booking | Slot | Notice |
|---|---|---|---|---|
| `Booked`, Tutor assigned, `>= 60:00` | valid Tutor cancel | `Cancelled` (actor Tutor, reason) | `Offered → Withdrawn` | one `TutorCancelled` |
| `Booked` | too late / wrong Tutor / blank reason | unchanged | unchanged | none |
| `Cancelled` | any Tutor cancel | unchanged | unchanged | none |
| `Booked` | Customer cancel (F-S2-01) | `Cancelled` (actor Customer) | stays `Offered` | none |
| `Booked` | reschedule (F-S2-02) | `Booked` moved | both `Offered` | none |

No `Withdrawn → Offered`; no notice for a Customer cancellation.

## 7. Transaction and lock protocol (proposed for review)

1. Authenticate `Tutor`; validate path UUID, body exactly `{ "reason": <string> }`, empty query.
2. Trim the reason; reject empty/whitespace-only → 400 `INVALID_INPUT`. Enforce the reviewed length bound.
3. Non-authoritative discovery: Booking → current Slot → Tutor/Customer for the lock set.
4. `BEGIN ISOLATION LEVEL SERIALIZABLE`.
5. Lock `User` rows ascending UUID: assigned Tutor and owning Customer. Revalidate Tutor active/role.
6. Lock the current `Slot`; revalidate `tutorId=principal.userId`, `lifecycle='Offered'`.
7. Lock the exact `Session`; revalidate `revokedAt IS NULL AND expiresAt > clock_timestamp()`.
8. Lock the `Booking`; revalidate `currentSlotId` unchanged, `customerId` matches the discovered Customer, `status='Booked'`. Foreign/unknown → 404; already cancelled → 409.
9. Sample `T_elig`; evaluate the 60-minute cutoff; fail → 422.
10. `UPDATE "Booking" SET "status"='Cancelled', "cancellationActor"='Tutor', "cancelledAt"=$elig, "tutorCancellationReason"=$reason, "updatedAt"=$elig`.
11. `UPDATE "Slot" SET "lifecycle"='Withdrawn', "withdrawnAt"=$elig WHERE "id"=$slot AND "lifecycle"='Offered'`.
12. `INSERT INTO "Notification" ("recipientCustomerId","bookingId","kind","createdAt") VALUES ($customer,$booking,'TutorCancelled',$elig)`.
13. COMMIT; return the Tutor-scoped result only after commit acknowledgement.
14. Retry `40001`/`40P01`/`P2034`/lock-set-change from fresh discovery, maximum three attempts; any constraint/guard breach fails closed.

**Ordering requirement:** the Booking must become `Cancelled` **before** the Slot is withdrawn, so the Slot guard never sees an active `Booked` row referencing a `Withdrawn` Slot. The Slot guard independently re-checks occupancy as a backstop.

## 8. Failure, rollback and retry

- Failure after the Booking update but before withdrawal/notice rolls back all three; no Cancelled row, no Withdrawn Slot, no notice.
- Failure after withdrawal but before notice rolls back all three.
- Unknown COMMIT outcome → 503 `MUTATION_OUTCOME_UNKNOWN`; re-read required.
- Two concurrent Tutor cancels: one wins; the loser sees `Cancelled` and returns 409; exactly one notice.
- Tutor cancel versus Customer cancel: one `Cancelled` transition; notice only if Tutor cancel committed; Slot `Offered` if Customer won, `Withdrawn` if Tutor won.
- Tutor cancel versus reschedule: exactly one wins; if reschedule wins, the former Tutor is no longer assigned and cannot cancel; no notice/withdrawal.
- Session revoked during a wait → 401, no write.

## 9. Security and privacy

- Foreign/unknown Booking → 404 identical body; wrong role → 403; anonymous → 401.
- The reason is returned only to the owning Customer (F-S2-04) and in their cancelled Booking detail; it is never returned to other Customers, other Tutors, or the Tutor's own schedule response.
- The Tutor cancellation response contains no Customer identity or reason echo.
- CSRF, Origin/Referer and expected Session binding are required.
- No reason is written to logs.

## 10. Acceptance criteria (feature-level, stable IDs)

| ID | Acceptance criterion |
|---|---|
| AC-S2-03-01 | Assigned Tutor cancels a `Booked` Booking at `>= 60:00` with a valid reason; 200; Booking `Cancelled` actor Tutor with reason; Slot `Withdrawn` with `withdrawnAt`; exactly one notice; all committed together. |
| AC-S2-03-02 | At exactly `60:00` the cancel succeeds; at `59:59.999` it fails 422 with no change. |
| AC-S2-03-03 | Wrong Tutor, unknown Booking, wrong role and anonymous callers are rejected 404/404/403/401 with no mutation and no identity leak. |
| AC-S2-03-04 | Absent, empty or whitespace-only reason → 400 `INVALID_INPUT`; no Booking/Slot/notice change. |
| AC-S2-03-05 | Already `Cancelled` → 409 `BOOKING_NOT_CANCELLABLE`; no second notice. |
| AC-S2-03-06 | Injected failure at any point leaves Booking, Slot and notices unchanged. |
| AC-S2-03-07 | Tutor cancel versus Customer cancel and versus reschedule commit at most one consistent outcome; never `Withdrawn + Booked`; notice only on a committed Tutor cancel. |
| AC-S2-03-08 | The withdrawn Slot cannot be booked, reopened or reactivated under the same ID; a new distinct Slot may later overlap it (F-S2-05). |
| AC-S2-03-09 | Direct SQL cannot withdraw an occupied Slot, cancel without actor/reason, or create a second notice for the Booking. |
| AC-S2-03-10 | Reason privacy holds in all accessible views and logs; no third-party identity, credential, SQL or stack trace. |

## 11. Dependencies, open decisions and blockers

- **Depends on:** accepted Slot/Booking schema; reviewed shared `booking_guard_s2()`; reviewed `slot_guard_s2()`; new `Notification` table; F-S2-04 for notice read; F-S2-04 Part E coordination.
- **OD-014 (OPEN):** "meaningful" beyond nonblank and the length bound are not approved.
- **OD-008 (OPEN):** notice/reason retention and deletion are not decided.
- **OD-013 (OPEN):** duplicate/uncertain cancel protocol is open.
- **Blocking migration:** `slot_guard_s1()` must be replaced in a separately reviewed migration before any Tutor cancellation code; the existing S1 guard forbids all Slot updates.

## 12. Definition of Done (for the later implementation Issue)

- Contract and STS reviewed before code.
- Reviewed migrations for `booking_guard_s2()`, `slot_guard_s2()`, `Notification` and constraints applied to disposable PostgreSQL 18.
- Real UI → API → DB Tutor cancellation journey plus cutoff/ownership/reason/rollback/race cases executed and recorded.
- Sprint 1 regression suite still passes.
- No unfinished Sprint 2 build deployed over the Lab 6 UAT release.

## 13. Independent review checklist

- [ ] Confirm assignment derives from `Slot.tutorId`, not a client Tutor ID.
- [ ] Confirm the 60-minute boundary uses post-lock `T_elig`, equality allowed.
- [ ] Confirm reason trim/empty rule and that OD-014 remains open.
- [ ] Confirm Booking-cancel → Slot-withdraw → notice order and atomic rollback.
- [ ] Confirm the Slot guard rejects occupied withdrawal and same-ID reactivation.
- [ ] Confirm exactly one notice and its privacy.
- [ ] Confirm races with Customer cancel and reschedule.
- [ ] Confirm no code, migration, executable test or deployment is claimed.
