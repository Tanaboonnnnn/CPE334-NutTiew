# F-S1-04 — PostgreSQL Booking Transaction, Lock and Retry Contract (Part E)

> **Selected engineering design for peer review.** Application transaction contract only, not a migration or SQL implementation. #16 owns this adapter; #33 owns the canonical Booking model and single DB guard. Align with [System SDS](../../system-sds.md) §§7.1/7.3–7.5, [BDF-D11/D12](../../foundations/booking-data/data-spec.md#7-booking-trigger-ownership-and-sprint-1-guard) and [BDF-23](../../foundations/booking-data/tests.md#2-planned-database-test-cases).

## 1. Selected transaction mechanism

- PostgreSQL **SERIALIZABLE** for each Booking mutation attempt.
- One attempt uses one checked-out PostgreSQL connection (F-S1-02 uses one `pg.PoolClient` for atomic mutation). Do not mix a Prisma transaction and independent `pg` connection and call them one transaction.
- Begin each attempt with `BEGIN ISOLATION LEVEL SERIALIZABLE`; all locks, reads and INSERT use that same connection.
- Explicit row locks follow System SDS global order. Unique/exclusion constraints and #33 trigger are mandatory backstops, not replacements for application locks.
- Commit before returning 201. Rollback, conflict, retry exhaustion or ambiguous COMMIT must never be represented as confirmed new Booking.

## 2. Lock-set discovery and global order

The selected Slot's actual Tutor ID determines the full User lock set. First perform an **unlocked, read-only discovery query** for selected Slot `id` and `tutorId`. This is not authorization, a booking check or source of interval values. Missing Slot → safe 404.

For every attempt, acquire locks in this exact order:

| Order | Rows | New Booking operation |
|---|---|---|
| 1 | Affected `User` rows, ascending UUID | Authenticated Customer and selected Slot's actual Tutor; deduplicate IDs |
| 2 | Affected `Slot` rows, ascending UUID | Selected Slot |
| 3 | Current Customer `Session` row | `principal.sessionId`, matched to `principal.userId`; lock only this authenticated Session after **all** User and Slot waits and before any Booking read/lock |
| 4 | Existing `Booking` rows, ascending UUID | No existing Booking is mutated by this INSERT-only operation. Read conflict predicates after User/Slot/Session checks; no nonexistent Booking row can be locked. |

The System SDS **domain** lock hierarchy remains User → Slot → Booking. The current Customer Session row is a subordinate authentication lock after the User and Slot phases but before any Booking access; it does not reverse the domain order. No transaction may lock Session and then request a User, Slot or Booking lock. The existing logout path updates only its Session row and does not acquire User/Slot locks: if logout commits while Booking is waiting for either User or Slot, the later Session lock/revalidation observes revocation or the stale SERIALIZABLE attempt aborts and retries with a fresh snapshot. If Booking obtains the Session lock first, logout waits and is serialized after the Booking transaction. Hold the Session lock through COMMIT/ROLLBACK.

Use deterministic ordered locking or explicit per-ID locks whose acquisition order is verified; do not rely on incidental query-plan order. After User locks, revalidate Customer `role='Customer'`/`isActive=true` and Tutor `role='Tutor'`/`isActive=true`. If the lock set/assignment differs, abort and restart from fresh discovery; never add an earlier-order User or Slot lock while holding a later-order Session/Booking lock.

The Session is an existing Auth record, not a Booking data addition. The principal and `sessionId` come from the HTTP guard; never accept either from the request body. The locked Slot row, not discovery pre-read or client data, supplies interval and Tutor association.

## 3. Ordered transaction algorithm

1. **HTTP boundary:** require live Session, active Customer role, allowed Origin, Session-bound CSRF and a matching `X-NutTiew-Expected-Session-Binding`. This is preliminary authentication; it does not replace transactional revalidation. Strictly parse one UUID `slotId`; reject extra body keys/query parameters.
2. **Discovery:** read selected Slot ID/Tutor ID without locks only to discover the User lock set. Missing Slot → 404.
3. **Begin:** check out one DB connection and start a fresh SERIALIZABLE transaction.
4. **Lock Users:** lock Customer and actual Tutor User rows in ascending UUID order. Revalidate Customer `role='Customer'`/`isActive=true` and Tutor `role='Tutor'`/`isActive=true`.
5. **Lock Slot:** lock the selected Slot row; re-read/compare Tutor ID, lifecycle and interval. Persisted locked state is authoritative.
6. **Lock current Session after the relevant waits:** on the same connection, lock `principal.sessionId` with `SELECT ... FROM "Session" WHERE id = principal.sessionId AND userId = principal.userId FOR UPDATE`. Do this only after all affected User and Slot locks have been acquired. If the row is absent or its version changed since the SERIALIZABLE snapshot, abort/retry the whole transaction; never continue using the HTTP middleware's earlier Session snapshot.
7. **Revalidate Session with DB time:** after the Session row lock is acquired, execute a fresh same-connection check requiring `revokedAt IS NULL AND expiresAt > clock_timestamp()`. If no live matching row exists, ROLLBACK and return 401 `UNAUTHENTICATED`; do not read/replay Booking data. This catches revocation during User/Slot waits and expiry during any preceding wait. Keep the Session lock through transaction end so a concurrent logout is serialized before or after the Booking, never halfway through its authorization decision.
8. **Natural-key replay first:** query `Booking` for exact `(customerId=principal.userId, currentSlotId=slotId, status='Booked')`. If found and interval matches locked Slot, COMMIT the read-only transaction and return 200 with that Booking ID. Do this **before** occupied-Slot rejection and before new-booking Q05.
9. **New-claim conflicts:** if any other `Booked` row occupies Slot, return 409 `SLOT_UNAVAILABLE`. If Customer has a different `Booked` interval with positive overlap (`existing.startsAt < slot.endsAt AND slot.startsAt < existing.endsAt`), return 409 `CUSTOMER_OVERLAP`. Exact adjacency is allowed.
10. **Guarded INSERT:** insert one row with server/DB-generated ID, authenticated Customer ID, locked Slot ID, persisted Slot interval and status `Booked`. #33 `booking_guard_s1()` locks/re-reads Slot (already held), then samples DB `clock_timestamp()` as authoritative `T_elig`; enforce `startsAt - T_elig >= interval '60 minutes'`. Exact 60:00 passes; 59:59 fails. Do not substitute application time, PostgreSQL transaction-start `now()`, HTTP arrival, #15 `T_view` or commit time.
11. **Commit:** COMMIT on the same connection. Return 201 with persisted Booking ID only after COMMIT acknowledgement.
12. **Release:** on error, ROLLBACK when connection is usable, release it and classify per §6. No external side effect runs inside transaction.

Same-pair replay is checked only after live Session revalidation and all relevant User/Slot lock waits. It returns the original committed record, does not INSERT and does not need new `T_elig`. Every new INSERT must pass the DB trigger.

## 4. Natural-key replay and uncertain COMMIT

Only replay identity:

```text
(authenticated customerId, slotId)
```

| Situation | Result |
|---|---|
| Valid new request commits | 201 with new Booking ID |
| Same Customer repeats same Slot after prior commit | 200 with exact original Booking ID; no INSERT |
| Different Customer submits occupied Slot | 409 `SLOT_UNAVAILABLE`; do not reveal owner |
| Same Customer submits a different overlapping Slot | 409 `CUSTOMER_OVERLAP` |
| Same Customer submits a different non-overlapping Slot | Distinct request; evaluate normal eligibility |
| Existing same-pair row is `Cancelled` | Not a Sprint 1 replay; future rebooking behavior is outside this contract |

A broken connection/timeout around COMMIT does not prove rollback. Server must not claim 201 or silently start a second mutation in the same request. If possible, return 503 `BOOKING_OUTCOME_UNKNOWN`; otherwise client sees network failure. Client retries exact same POST body. A fresh transaction returns 200 if original row committed, or creates one row if it did not. No key registry or TTL is required.

**SERIALIZABLE snapshot caveat:** second concurrent request may take its snapshot before waiting on Customer/Slot lock; lock release does not refresh that snapshot. It may not see the first transaction's newly committed row and PostgreSQL may instead raise 40001 or a unique/exclusion conflict. Do not assume post-lock SELECT sees a newer snapshot. Full retry and post-rollback exact-pair reconciliation in §6 must return 200 for same pair, not create another row or report permanent conflict.

## 5. Race and Q05 safety / no-post-guard-contention proof

### Race B — two Customers, one Slot

Both attempts lock their own Customer and the same Slot before conflict checks/INSERT. Slot lock serializes compliant API writers. After winner commits, loser sees occupied state on a fresh attempt or loses to unique constraint; at most one active row can commit.

### Race C — one Customer, two Tutors

Both attempts include same Customer User row in affected User lock set, even though selected Tutors/Slots differ. UUID-sorted User locking serializes Customer's Booking writes before guarded INSERT. GiST exclusion remains final DB backstop; no positive-duration overlapping active rows may commit. Adjacency remains allowed.

### Q05 — post-contention eligibility

Application acquires known conflict-serialization User/Slot locks before guarded INSERT. #33 trigger's Slot `FOR UPDATE` must re-lock a row already held, so it creates no new Slot wait after `T_elig`. Only trigger-side DB `clock_timestamp()` after that lock is authoritative. A request received at 13:59:59 that waits until 14:00:01 for a 15:00 Slot must fail; a valid 60:00 guard may still commit later.

### Mandatory no-post-guard-contention proof

Unique active-Slot index and same-Customer GiST exclusion may wait on another transaction after the BEFORE INSERT trigger has sampled `T_elig`. Normal API lock protocol is intended to make every compliant conflicting writer acquire same Customer and/or Slot lock before guarded INSERT: Race B shares Slot; Race C shares Customer; all affected User rows precede Slot rows.

This intent is **not proof** against direct SQL or a writer bypassing the application protocol. BDF-23 must use independent PostgreSQL sessions, backend PIDs, `pg_blocking_pids`, trigger-observed `T_elig`, constraint outcomes and final committed rows. Force an unexpected unique/exclusion index wait after preliminary validation and establish one of:

1. Prove no conflict-capable wait can occur after `T_elig` under actual #33 trigger/role/writer arrangement; or
2. Demonstrate complete transaction aborts before it can commit a stale-time INSERT, then restarts with all locks reacquired and fresh DB `T_elig`.

If a forced post-guard wait can resolve and allow an INSERT to commit using stale `T_elig`, BDF-23 fails. Do not treat SERIALIZABLE alone, application pre-check, random `Promise.all()`, timeout-only test or blanket commit-time cutoff as proof. If neither outcome is demonstrated, #16 Part F is blocked and #33/#16 lock/guard contract must be revised through review.

## 6. Retry, conflict and failure classification

### 6.1 Full transaction retry

Retry known aborts only: SQLSTATE `40001` (serialization), `40P01` (deadlock), ORM equivalent `P2034` if surfaced, or changed/missing lock-set member between discovery and locked re-read after abort.

Policy: maximum **three total mutation attempts**, including first. Each retry starts a new transaction/snapshot, rediscovers Slot's actual Tutor, reacquires all locks in order and reruns checks. Every retry reaching a new INSERT invokes trigger and samples fresh `T_elig`. Use short capped exponential jitter; never retry indefinitely. Exhaustion → 503 `TRANSACTION_RETRY_EXHAUSTED`; every failed attempt rolls back.

### 6.2 Unique/exclusion conflict and reconciliation

SQLSTATE `23505` and `23P01` are not blind mutation retries:

1. Roll back failed transaction.
2. Perform one fresh read for exact authenticated `customerId + slotId + status='Booked'`.
3. If committed row exists and interval matches selected Slot, return 200 with original ID.
4. Otherwise return 409 (`SLOT_UNAVAILABLE` for occupied Slot; `CUSTOMER_OVERLAP` for different overlapping Booking).
5. Never spin until a genuine conflict disappears.

This fresh read is reconciliation, not a second mutation attempt.

### 6.3 Other failures

- Non-Offered Slot: rollback and map #33 trigger diagnostic `P0B01` / `booking_slot_not_offered` to 409 `SLOT_UNAVAILABLE`.
- Q05 failure: rollback and map #33 trigger diagnostic `P0B02` / `booking_q05_min_notice` to 422 `BOOKING_NOT_ELIGIBLE`.
- #33 Part F owns and must implement/publish both stable SQLSTATE/constraint pairs. Unknown guard diagnostics fail closed as 500 `INTERNAL_ERROR`; never guess a Q05 failure. BDF-D11's `0A000` is reserved for forbidden UPDATE/DELETE/TRUNCATE, not INSERT eligibility.
- Known DB failure before COMMIT/confirmed rollback: safe 503 `SERVICE_UNAVAILABLE`.
- Ambiguous COMMIT acknowledgement: 503 `BOOKING_OUTCOME_UNKNOWN` if possible; client repeats exact request.
- Unexpected `0A000` on INSERT-only endpoint or unmapped integrity failure: rollback, safe 500 and non-sensitive diagnostics.
- Malformed/unauthorized requests and business conflicts are not retried.

## 7. Real-PostgreSQL proof gate

BDF-23 is owned by #16 and runs only after #33 Part F merges with exact schema SHA. Evidence must include independent sessions/barriers for Race B/C; backend PIDs/blockers; User → Slot → Session auth-lock order and Session revalidation after waits; trigger Slot lock already held; `T_elig` after required waits; forced unexpected unique/exclusion index wait; 60:00/59:59 and HTTP-arrival-before-cutoff cases; sequential/in-flight/lost-response same-pair replay; pre-COMMIT failure injection; final rows from fresh connection; PostgreSQL version, schema SHA, SQLSTATE/constraint, commands and source commit.

BDF-23 is **PLANNED / NOT RUN** in Part E. If post-guard contention challenge fails, do not approve adapter or claim #16 Part F complete.
