# F-S2-05 — Tutor Slot Withdrawal Feature SDS (Part E)

> **Documentation contract only; no application code, migration, executable test, PostgreSQL run or approval is included.** Issue [#114](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/114); owner and independent reviewer are to be assigned by the two-person team. Prepared on `docs/114-s2-contracts` from local `origin/sprint1` @ `41b310c83573e672be8c4189607380d56e598291`; the remote head was **not** re-fetched. Status: **DRAFT FOR HUMAN REVIEW**.

## 1. Authority and baseline

Sources: [SRS](../../srs.md) (Q26/Q27/Q32, FR-033/034, BR-026/027/032, NFR-004/005, VAL-025..027), [Feature Inventory](../../features.md), [traceability](../../traceability.md), [System SDS](../../system-sds.md) (§§3.2–3.3, 4, 7.1, 7.4–7.5), [plan](../../sprints/plan.md), and the accepted Sprint 1 Slot contract.

**Verified local facts:** `Slot.lifecycle` already allows `Withdrawn` and requires `withdrawnAt`; the GiST exclusion `offered_slot_no_overlap_per_tutor` applies only to `lifecycle='Offered'`, so a historical `Withdrawn` Slot does not block a new distinct overlapping offer. `slot_guard_s1()` currently forbids every Slot update/delete. `listOwnSlots` currently types `lifecycle` as `'Offered'` and returns all rows, so the DTO needs an S2 extension. No `Slot` history table exists; the `Slot` row itself is the history.

**Sprint 1 baseline isolation:** no Sprint 1 endpoint, constraint or test is redefined. Enabling Slot withdrawal is S2-only and must not be deployed over the Lab 6 UAT release.

## 2. Outcome and journey

An authenticated Tutor withdraws an own, future, currently `Offered`, unoccupied Slot. The Slot becomes `Withdrawn` with `withdrawnAt`; it is retained as history, disappears from Customer availability, cannot be reactivated under the same ID, and no longer blocks a new distinct Slot that overlaps its interval.

1. Tutor opens their own Slot list; a future `Offered` Slot with no Active Booking shows a **Withdraw** action.
2. Tutor confirms; the request carries only the Slot ID.
3. Server derives the Tutor from the live Session and locks the Tutor User and the Slot.
4. Revalidates ownership, `lifecycle='Offered'`, `startsAt > T_elig`, and no `Booked` Booking referencing the Slot.
5. Sets `lifecycle='Withdrawn'`, `withdrawnAt=T_elig`; commits.
6. Only after COMMIT does the API return the updated Slot. The historical row remains visible to the Tutor with `lifecycle='Withdrawn'`.

## 3. Scope

**In scope:** Tutor-only withdrawal of an own unoccupied future `Offered` Slot; retained history; no same-ID reactivation; new distinct overlapping Slot allowed; response/error contract; lock order, Session revalidation, rollback/retry; the shared S2 Slot guard; UI and planned STS.

**Out of scope:** withdrawing an occupied Slot (forbidden; F-S2-03 must cancel first), withdrawing a past Slot, deleting a Slot, editing a Slot's Tutor/time/ID, reactivating a `Withdrawn` Slot, Slot creation (Sprint 1), Customer availability changes, cancellation/reschedule/notice behaviour, and deployment.

**No-change layers:** Slot creation and its GiST exclusion; `slot_exactly_one_hour`; `slot_id_window_unique`; Booking constraints/guards; auth/CSRF.

## 4. Invariants

| Invariant | F-S2-05 contract |
|---|---|
| Ownership | `Slot.tutorId = principal.userId`; foreign/unknown → 404. |
| State | Only `lifecycle='Offered'` may be withdrawn; `Withdrawn` is terminal. |
| Time | `Slot.startsAt > T_elig` (strictly future). A Slot starting at or before `T_elig` is not withdrawable. |
| Occupancy | No `Booking` with `status='Booked'` may reference the Slot; otherwise reject. |
| History | The same row is retained with `lifecycle='Withdrawn'` and `withdrawnAt`; no delete. |
| No reactivation | `Withdrawn → Offered` is rejected; no same-ID reuse. |
| Overlap | The GiST exclusion ignores `Withdrawn` rows, so a later distinct Slot may overlap the withdrawn interval. |
| Atomicity | One Slot update commits or rolls back; no partial lifecycle/withdrawnAt. |
| Concurrency | The Slot lock serializes withdrawal against new Booking, reschedule and Tutor cancellation. Final state is never `Withdrawn + Booked`. |

## 5. Business rules

- **BR-026 / FR-033:** an Active Booking blocks direct edit/delete/withdrawal; the authorized cancellation must happen first.
- **BR-027 / FR-034:** own unoccupied future Slot may be withdrawn; history retained; a distinct new Slot may be created.
- **BR-032:** historical withdrawn Slots do not block a new separate overlapping offer and are not reactivated under the same ID.
- Withdrawal is not a cancellation and creates no Customer notice; there is no Booking to cancel.

## 6. State model

| From | Event | To | Availability |
|---|---|---|---|
| `Offered`, future, unoccupied | owner withdraws | `Withdrawn` + `withdrawnAt` | no longer offered |
| `Offered`, occupied | withdraw attempt | unchanged | unchanged |
| `Offered`, past/starting now | withdraw attempt | unchanged | unchanged |
| `Withdrawn` | any withdraw attempt | unchanged | unchanged |
| `Withdrawn` | reactivate attempt | rejected | unchanged |

A new distinct Slot at an overlapping time is a separate row with a new ID.

## 7. Transaction and lock protocol (proposed for review)

1. Authenticate `Tutor`; validate path UUID; body exactly `{}`; empty query.
2. Non-authoritative discovery of the Slot's `tutorId` for the lock set.
3. `BEGIN ISOLATION LEVEL SERIALIZABLE`.
4. Lock the owning Tutor `User` row; revalidate active `Tutor`.
5. Lock the `Slot` row; revalidate `tutorId=principal.userId`, `lifecycle='Offered'`, and `startsAt > clock_timestamp()`.
6. Lock the exact `Session`; revalidate `revokedAt IS NULL AND expiresAt > clock_timestamp()`.
7. Under the Slot lock, `SELECT id FROM "Booking" WHERE "currentSlotId"=$slot AND "status"='Booked' FOR UPDATE LIMIT 1`; if found → 409 `SLOT_OCCUPIED`.
8. Sample `T_elig`; re-check `startsAt > T_elig`.
9. `UPDATE "Slot" SET "lifecycle"='Withdrawn', "withdrawnAt"=$elig WHERE "id"=$slot AND "lifecycle"='Offered'`; require `rowCount=1`.
10. COMMIT; return the updated Slot DTO only after commit acknowledgement.
11. Retry `40001`/`40P01`/`P2034`/lock-set-change from fresh discovery, maximum three attempts; any guard/constraint breach fails closed.

The `slot_guard_s2()` trigger independently rejects occupied withdrawal (`P0B03`), reactivation (`P0B04`) and any other mutation. See [data-spec](data-spec.md) §3.

## 8. Failure, rollback and retry

- Injected failure after the Slot update but before COMMIT leaves `Offered` with `withdrawnAt NULL`.
- A concurrent new Booking on the Slot either wins before the withdrawal (withdrawal then returns 409 `SLOT_OCCUPIED`) or loses before the withdrawal (booking returns 409 `SLOT_UNAVAILABLE`); the committed pair is never `Withdrawn + Booked`.
- A concurrent Tutor cancellation of an **existing `Booked`** Booking on the same Slot: a direct withdrawal may **never** win while the Booking is active. If withdrawal checks first, it must return 409 `SLOT_OCCUPIED`; Tutor cancellation may then commit `Cancelled + Withdrawn + one notice`. If Tutor cancellation commits first, withdrawal sees `Withdrawn` and returns 409 `SLOT_ALREADY_WITHDRAWN`. Neither ordering permits a successful independent withdrawal of the initially occupied Slot, nor an orphan notice.
- Unknown COMMIT outcome → 503 `MUTATION_OUTCOME_UNKNOWN`; re-read required.
- Session revoked during a wait → 401, no write.

## 9. Security and privacy

- Foreign/unknown Slot → 404 identical body; wrong role → 403; anonymous → 401.
- The response exposes only the Tutor's own Slot fields; no Customer or Booking identity.
- No reason, credential, Session/CSRF data, SQL or stack trace.
- CSRF, Origin/Referer and expected Session binding are required.

## 10. Acceptance criteria (feature-level, stable IDs)

| ID | Acceptance criterion |
|---|---|
| AC-S2-05-01 | Owner withdraws an own future unoccupied `Offered` Slot; 200; `lifecycle='Withdrawn'`, `withdrawnAt` set; exactly one row update; the Slot disappears from availability. |
| AC-S2-05-02 | Foreign/unknown Slot → 404; wrong role → 403; anonymous → 401; no mutation and no identity leak. |
| AC-S2-05-03 | A Slot with a `Booked` Booking cannot be withdrawn; 409 `SLOT_OCCUPIED`; Booking/Slot unchanged. |
| AC-S2-05-04 | A Slot whose start is at or before `T_elig` is rejected 422 `SLOT_NOT_WITHDRAWABLE`; no change. |
| AC-S2-05-05 | An already `Withdrawn` Slot returns 409 `SLOT_ALREADY_WITHDRAWN`; no reactivation under the same ID. |
| AC-S2-05-06 | After withdrawal, a distinct new Slot with a new ID may overlap the withdrawn interval and is accepted if otherwise valid. |
| AC-S2-05-07 | Withdrawal-versus-new-Booking produces `(Offered + Booked)` or `(Withdrawn + no Booked)`. With an **initially occupied** Slot, withdrawal-versus-Tutor-cancellation must reject the independent withdrawal (occupied before cancellation; already Withdrawn after it); only a valid Tutor-cancel transaction can make `Cancelled + Withdrawn + one notice`. Never `Withdrawn + Booked` or an orphan notice. |
| AC-S2-05-08 | Injected failure or Session revocation leaves the Slot `Offered`/unchanged and returns a safe non-success. |
| AC-S2-05-09 | Direct SQL cannot withdraw an occupied Slot, reactivate a `Withdrawn` Slot, change its Tutor/interval/ID, delete it or truncate it. |

## 11. Dependencies, open decisions and blockers

- **Depends on:** accepted Slot schema; reviewed `slot_guard_s2()` (shared with F-S2-03); Sprint 2 Slot DTO extension; F-S2-05 Part E review.
- **OD-008:** retention of withdrawn Slot history is not separately decided; no delete is authorized.
- **OD-013:** duplicate/uncertain withdrawal protocol is open; a retry after success returns 409. The scoped behavior does not decide general idempotency: reconcile through the authenticated own-list GET before offering a retry; never auto-retry an unknown outcome. Likewise, OD-008 adds no deletion or retention change. See the reviewed #126 contract, #128 database transition, #132 reconciliation precedent, and #133 no-retention-change scope.
- **Blocker:** `slot_guard_s1()` forbids all Slot updates, so implementation cannot start before the reviewed S2 guard migration.

## 12. Definition of Done (for the later implementation Issue)

- Contract and STS reviewed before code.
- Reviewed `slot_guard_s2()` migration applied to disposable PostgreSQL 18; no Prisma drift.
- Real UI → API → DB withdrawal journey plus ownership/occupancy/time/reactivation/race/rollback cases executed and recorded.
- Sprint 1 regression suite still passes.
- No unfinished Sprint 2 build deployed over the Lab 6 UAT release.

## 13. Independent review checklist

- [ ] Confirm ownership derives from `Slot.tutorId`.
- [ ] Confirm strict future rule and `T_elig` sampling after locks.
- [ ] Confirm occupied Slots are rejected and the guard independently enforces it.
- [ ] Confirm no same-ID reactivation and retained history.
- [ ] Confirm the withdrawn row does not block a distinct overlapping offer.
- [ ] Confirm races with Booking and Tutor cancellation.
- [ ] Confirm no code, migration, executable test or deployment is claimed.
