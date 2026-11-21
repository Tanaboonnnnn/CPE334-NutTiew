# F-S2-01 — Customer Cancellation and Slot Reopen Feature SDS (Part E)

> **Documentation contract only; no application code, migration, executable test, PostgreSQL run or approval is included.** Issue [#114](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/114); owner and independent reviewer are to be assigned by the two-person team (the author must not self-review). Prepared on `docs/114-s2-contracts` from local `origin/sprint1` @ `41b310c83573e672be8c4189607380d56e598291`; the remote head was **not** re-fetched. Status: **DRAFT FOR HUMAN REVIEW**.

## 1. Authority and baseline

Sources: [SRS](../../srs.md) (Q07/Q08/Q05, FR-020/021, BR-007/008, NFR-005/006/007/008, VAL-015/016), [Feature Inventory](../../features.md), [traceability](../../traceability.md), [System SDS](../../system-sds.md) (§§3.2–3.3, 4, 5, 7.1, 7.4–7.5), [three-sprint plan](../../sprints/plan.md), and the accepted Sprint 1 Booking contracts ([F-S1-04 specification](../F-S1-04/specification.md), [data](../F-S1-04/data-spec.md), [transaction](../F-S1-04/transaction-spec.md)) and retrieval contract ([F-S1-05 API](../F-S1-05/api-spec.md)).

**Verified local facts:** `Slot.lifecycle` already permits `Offered`/`Withdrawn` with `slot_lifecycle_consistent`; `slot_guard_s1()` currently forbids every Slot mutation; `booking_guard_s1()` currently rejects every Booking `UPDATE`/`DELETE`/`TRUNCATE` as append-only. Customer cancellation needs **no Slot mutation** (the original Slot stays `Offered`; occupancy is derived from `Booking.status='Booked'`) but **does** require a separately reviewed forward migration that replaces the append-only Booking guard.

**Sprint 1 baseline isolation:** this contract does not change any Sprint 1 endpoint, DTO field, constraint or test. The required DTO extension (`Cancelled` status) is a Sprint 2 change recorded in [data-spec](data-spec.md) §6 and must be regression-tested against the Sprint 1 suite. No deployment of this feature may occur while Lab 6 partner UAT is using the pinned release; see [readiness](../../sprints/sprint2-contract-readiness.md).

## 2. Outcome and journey

An authenticated Customer cancels their own current `Booked` Booking when its start is at least 30 minutes after the server's authoritative decision. The Booking becomes `Cancelled`; the original Slot remains `Offered` and becomes unoccupied atomically. A later new Booking on that Slot is still independently gated by the 60-minute new-Booking rule.

1. Customer opens an own Booking detail/list entry with `status='Booked'`.
2. Customer confirms cancellation; the request carries only the Booking identifier and no owner, status, time or reason fields.
3. API authenticates a live Customer Session and derives the owner from `principal.userId`.
4. The transaction discovers the current Slot/Tutor for the lock set, locks User rows (Customer + current Tutor) in ascending UUID order, the current Slot, the exact Session, then the Booking row, and re-reads ownership/status.
5. `T_elig` is sampled from PostgreSQL `clock_timestamp()` after all lock waits; the 30-minute predicate is evaluated at `T_elig`.
6. One `Booked → Cancelled` update commits with `cancellationActor='Customer'`; no Slot write occurs.
7. Only after COMMIT does the API return the updated Cancelled Booking; failures return a safe error and change nothing.

## 3. Scope

**In scope:** Customer-only cancellation of an own `Booked` Booking; 30-minute authoritative cutoff; atomic `Booked → Cancelled`; original Slot left `Offered` and immediately unoccupied; response/error contract; lock order, Session revalidation, rollback and retry; the Booking-guard migration requirement; UI cancellation states; planned STS and DoD.

**Out of scope:** Tutor cancellation (F-S2-03), reschedule (F-S2-02), notices (F-S2-04), Slot withdrawal (F-S2-05), refunds/payments, `Completed`/attendance, user deletion, retention policy (OD-008), new idempotency-key protocol (OD-013), any Slot lifecycle mutation, any production deployment, and any change to Sprint 1 new-Booking eligibility.

**No-change layers:** `Slot` rows and `slot_guard_s1()`; new-Booking Q05 guard `booking_guard_s1()` INSERT path; availability projection; auth/CSRF middleware; Tutor schedule read path.

## 4. Invariants

| Invariant | F-S2-01 contract |
|---|---|
| Ownership | Only `Booking.customerId = principal.userId` from a live Customer Session; client owner/role never trusted. Foreign and nonexistent Booking both return 404. |
| State | Only `status='Booked'` may transition. `Cancelled` is terminal; a repeat returns 409 and changes nothing. |
| Cutoff | Eligible iff `Booking.startsAt - T_elig >= 30 minutes`; equality passes, just-below fails. `T_elig` is DB `clock_timestamp()` sampled after required locks. |
| Atomicity | The `Booked → Cancelled` update, `cancellationActor`, `cancelledAt` and `updatedAt` commit together. No Slot write and no notice. |
| Slot outcome | Original Slot remains `Offered`, `withdrawnAt IS NULL`; occupancy is derived, so it becomes unoccupied only when the Cancelled commit is visible. |
| New-Booking gate | Reopening never bypasses Q05: a new Booking with `Slot.startsAt - T_elig < 60 minutes` is rejected by the existing Sprint 1 guard. |
| Concurrency | At most one active `Booked` row per Slot; cancel-versus-new-Booking serializes on the shared Slot lock. |
| Privacy | Response exposes only owner-scoped Booking data already defined by F-S1-05; no Customer/Tutor identity, reason or raw DB diagnostics. |

## 5. Business rules and cutoff math

- **BR-007 / FR-020:** owner only, `startsAt - T_elig >= 30m`.
- **FR-021 / BR-008:** Booking `Cancelled`; original Slot stays `Offered`; occupancy released.
- **BR-030:** `Cancelled` is a persisted status; `Past` remains a derived display class for `Booked` rows only. A Cancelled Booking is never displayed as `Past`.
- `T_elig` is never the HTTP arrival time, `now()` (transaction start) or a client timestamp.
- Asia/Bangkok (UTC+07:00) is a display/input concern; storage remains `TIMESTAMPTZ(6)`.

## 6. State model

| From | Event | To | Slot lifecycle | Occupancy |
|---|---|---|---|---|
| `Booked` | owner cancel at `>= 30:00` | `Cancelled` | stays `Offered` | released after commit |
| `Booked` | owner cancel at `< 30:00` | `Booked` (unchanged) | unchanged | unchanged |
| `Cancelled` | any cancel request | `Cancelled` (unchanged) | unchanged | unchanged |
| `Booked` | Tutor cancel (F-S2-03) | `Cancelled` | `Offered → Withdrawn` | released, Slot not rebookable |
| `Booked` | reschedule (F-S2-02) | `Booked` (moved) | both Slots stay `Offered` | old released, destination claimed |

There is **no** `Cancelled → Booked` transition and no same-ID Slot reactivation.

## 7. Transaction and lock protocol (proposed for review)

1. Authenticate via `requireSession` + `requireRole('Customer')`; validate the request body is exactly `{}` (no fields) and the path UUID is valid.
2. Non-authoritative unlocked discovery of `Booking → currentSlotId → Slot.tutorId` to build the lock set. This read is not an authorization or status decision.
3. `BEGIN ISOLATION LEVEL SERIALIZABLE` on one checked-out client.
4. Lock `User` rows in ascending UUID order: owner Customer and current Slot's Tutor (deduplicated). Revalidate owner is an active `Customer`; missing/inactive → 401, wrong role → 403.
5. Lock the current `Slot` row; revalidate it still matches the discovered Booking reference and is `Offered`.
6. Lock the exact `Session` row (`id`, `userId`) and revalidate `revokedAt IS NULL AND expiresAt > clock_timestamp()`; invalid → 401.
7. Lock the `Booking` row `FOR UPDATE`; revalidate `customerId = principal.userId`, `currentSlotId` unchanged, and `status='Booked'`. Missing/foreign → 404; already `Cancelled` → 409.
8. Sample `T_elig = clock_timestamp()`; evaluate `startsAt - T_elig >= INTERVAL '30 minutes'`; fail → 422 with no write.
9. `UPDATE "Booking" SET "status"='Cancelled', "cancellationActor"='Customer', "cancelledAt"=$elig, "updatedAt"=$elig WHERE "id"=$id`.
10. COMMIT; return the updated owner-scoped Booking DTO only after commit acknowledgement.
11. On `40001`/`40P01`/`P2034` or lock-set change, roll back the whole attempt and retry from fresh discovery, maximum three attempts; on exhaustion return 503 `TRANSACTION_RETRY_EXHAUSTED`. A `23505`/`23P01` conflict here indicates an unexpected invariant breach and must fail closed.

**Guard migration requirement:** the current `booking_s1_row_guard` rejects all UPDATEs. F-S2-01 cannot be implemented until a separately reviewed forward migration replaces it with an S2 guard that permits exactly `Booked → Cancelled` (status/actor/time only) and rejects every other UPDATE, every DELETE/TRUNCATE, and any change to `customerId`, `currentSlotId`, `startsAt` or `endsAt`. That migration is **not authored by Issue #114**; see [data-spec](data-spec.md) §5.

## 8. Failure, rollback and retry

- Injected failure after the UPDATE but before COMMIT must leave the Booking `Booked` and the Slot occupied.
- Unknown COMMIT outcome is not proof of rollback: return 503 `MUTATION_OUTCOME_UNKNOWN` and require an authenticated re-read; no false success.
- Duplicate concurrent cancels: one transition wins; the loser re-reads `Cancelled` and returns 409, never a second effect.
- Session revoked/expired during a lock wait: the post-wait revalidation returns 401 with no write.
- No blind retry outside the transaction; no partial Slot/Booking/notice state.

## 9. Security and privacy

- Anonymous → 401; wrong role → 403; foreign or unknown Booking → 404 with an identical body.
- No customer ID, Tutor identity, password, Session/CSRF data, SQL text or stack trace in any response or log line.
- CSRF, canonical Origin/Referer and `X-NutTiew-Expected-Session-Binding` are required exactly as for Sprint 1 mutations.
- Cancellation reason is never accepted on the Customer path.

## 10. Acceptance criteria (feature-level, stable IDs)

| ID | Acceptance criterion |
|---|---|
| AC-S2-01-01 | Owner cancels a `Booked` Booking at `>= 30:00`; response is 200 with `status='Cancelled'`, `cancellationActor='Customer'`, `cancelledAt` set; exactly one committed update; Slot stays `Offered` and becomes unoccupied. |
| AC-S2-01-02 | At exactly `30:00` the cancel succeeds; at `29:59.999` it fails 422 `CANCELLATION_WINDOW_CLOSED` with no change. |
| AC-S2-01-03 | Foreign/unknown Booking → 404; already `Cancelled` → 409 `BOOKING_NOT_CANCELLABLE`; anonymous → 401; wrong role → 403; all with no mutation. |
| AC-S2-01-04 | A reopened Slot is unoccupied but a new Booking with `< 60:00` notice is still rejected by the independent Sprint 1 guard. |
| AC-S2-01-05 | Cancel-versus-new-Booking race in both orders: a contender arriving while the original remains `Booked` fails; after cancellation commits, a new Booking succeeds only if Q05 and all other rules pass. Valid final outcomes include `(original Cancelled + new Booked)`, `(original Cancelled + no new Booked)`, or `(original Booked + no new Booked)` if cancellation fails; never two active `Booked` rows. |
| AC-S2-01-06 | Injected DB failure or Session revocation mid-transaction leaves the prior Booking/Slot state and returns a safe non-success. |
| AC-S2-01-07 | The cutoff is evaluated at `T_elig` after a forced lock wait crossing the 30-minute boundary; a stale pre-wait decision is not used. |
| AC-S2-01-08 | Response and logs contain no third-party identity, reason, credential, Session/CSRF data, SQL or stack trace. |
| AC-S2-01-09 | Direct SQL cannot produce a second Cancelled effect, reopen a Cancelled Booking or change the Booking's owner/Slot/interval. |

## 11. Dependencies, open decisions and blockers

- **Depends on:** accepted Sprint 1 Booking schema, `booking_guard_s1()` and retrieval DTOs; a separately reviewed S2 guard migration; F-S2-01 Part E review.
- **OD-013 (OPEN):** repeated/uncertain cancel submissions. This contract fixes the invariant (no duplicate effect) but not an idempotency-key protocol; the client must re-read the Booking.
- **OD-008 (OPEN):** retention/deletion of cancelled Booking history is not decided; no delete endpoint is authorized.
- **OD-015 (OPEN):** previous-Tutor visibility after reschedule is not affected by this feature.
- **No new OD is invented.** If the team wants a different duplicate-response rule, it must be recorded as an approved decision before code.

## 12. Definition of Done (for the later implementation Issue)

- Contract and STS reviewed by the other human teammate before code.
- Reviewed S2 guard migration applied to a disposable PostgreSQL 18 database; no Prisma drift and no dropped constraints.
- Real UI → API → DB cancel journey and negative/authorization/cutoff/rollback/concurrency cases executed with recorded PASS/FAIL/SKIP.
- Sprint 1 regression suite still passes.
- No unfinished Sprint 2 build deployed over the Lab 6 UAT release.

## 13. Independent review checklist

- [ ] Confirm the 30-minute boundary uses DB `T_elig` after locks, equality allowed.
- [ ] Confirm no Slot mutation and no notice on Customer cancellation.
- [ ] Confirm the S2 guard permits exactly `Booked → Cancelled` and fails closed otherwise.
- [ ] Confirm lock order and Session revalidation match Sprint 1 conventions.
- [ ] Confirm 404-for-foreign privacy and safe error taxonomy.
- [ ] Confirm AC/STS coverage of VAL-015/016 and NFR-005/006/007.
- [ ] Confirm no code, migration, executable test or deployment is claimed by this Part E document.
