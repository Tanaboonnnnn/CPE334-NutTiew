# F-S1-04 — Booking Data Contract (Part E)

> **Consumes #33's shared contract; does not define or implement a second schema.** No Prisma model, SQL migration, trigger, index or database test is added by Issue #16 Part E.

## 1. Canonical source and ownership

Canonical Booking fields, relations and integrity decisions are owned by [#33 Foundation SDS](../../foundations/booking-data/specification.md), [data specification](../../foundations/booking-data/data-spec.md) and [BDF STS](../../foundations/booking-data/tests.md), merged by PR #34 at `ea36ef6fd3ea7e2c2582489d1326adbd335452ee`.

That is a documentation merge, **not** a future schema/migration SHA. #16 Part F waits for #33 Part F to merge and records its exact schema SHA before implementing Booking-dependent code/tests.

## 2. Canonical Booking mapping

| Field | Canonical type/source | #16 write rule |
|---|---|---|
| `id` | Server/database-generated UUID PK | Never accept from request; return only after COMMIT or same-pair replay |
| `customerId` | UUID FK to `User.id` | Live authenticated Customer `principal.userId` |
| `currentSlotId` | UUID FK to `Slot.id` | Validated request `slotId` |
| `startsAt` / `endsAt` | `TIMESTAMPTZ(6)` | Copy persisted Slot interval; never client input |
| `status` | Text: `Booked` / `Cancelled` | New Sprint 1 row always `Booked` |
| `createdAt` / `updatedAt` | `TIMESTAMPTZ(6)` metadata | Not an eligibility clock |

There is **no Booking `tutorId` field**. Current Tutor derives from `Slot.tutorId` through `currentSlotId`. Composite Slot-window FK enforces that copied Booking interval matches the immutable Slot.

## 3. Database invariants consumed

#33 Part F owns and must implement BDF-D01..D12:

- Required Customer/Slot references, restrictive parent delete/update behavior and positive interval.
- Supported `Booked`/`Cancelled` status; only `Booked` occupies/conflicts.
- Composite Slot-window FK matching `currentSlotId`, `startsAt`, `endsAt`.
- Partial unique `booking_one_active_per_slot` for one Active Booking per Slot.
- GiST exclusion `booked_customer_no_overlap` for positive-duration same-Customer Active interval overlap across Tutors; half-open adjacency is allowed.
- One shared `booking_guard_s1()` row-level `BEFORE INSERT OR UPDATE OR DELETE` trigger and statement-level `BEFORE TRUNCATE` trigger, plus runtime-role boundary.
- Sprint 1 append-only lifecycle. #16 performs INSERT only; no UPDATE/DELETE/TRUNCATE operation exists in this feature.

#16 must not duplicate model, trigger, migration, occupancy field or Tutor reference.

## 4. Natural-key replay mapping — no schema addition

Application lookup pair:

```text
(authenticated principal.userId, requested slotId)
```

Exact replay predicate:

```text
customerId = principal.userId
AND currentSlotId = slotId
AND status = 'Booked'
```

Rules:

1. Query this pair only after the transaction has acquired ordered User and Slot locks, locked/revalidated the current Customer Session, and rechecked Session validity after the final lock wait.
2. Check it **before** occupied-Slot rejection and before a new-booking Q05 check. A matching committed `Booked` row is already successful: return 200 and original ID without INSERT or new `T_elig`.
3. The pair is not a new composite UNIQUE constraint, column, Idempotency-Key, registry, fingerprint or TTL.
4. Only `Booked` qualifies. A future `Cancelled` row is not a replay; S2 rebooking semantics need their own contract.
5. If no matching row exists, apply Slot occupancy, Customer overlap and guarded INSERT checks. Another Customer's occupied Slot or a different overlapping Slot for this Customer is a conflict.
6. Only the exact structured tuples `23505 / booking_one_active_per_slot` and `23P01 / booked_customer_no_overlap` are recognized as Booking business conflicts. Capture SQLSTATE and constraint metadata; never parse error text. Any unknown/missing/mismatched tuple (including a different `23505`) rolls back and returns safe 500 `INTERNAL_ERROR` without entering replay reconciliation.
7. For a recognized tuple, ROLLBACK and discard the failed snapshot; on a fresh connection begin a READ COMMITTED reconciliation transaction. Lock the current User row for the original `principal.userId` first and revalidate latest `isActive`/role: missing or inactive → 401; active but no longer Customer → 403. Only then lock the exact authenticated Session (`principal.sessionId` + `principal.userId`) with `FOR UPDATE` and check `revokedAt IS NULL` and `expiresAt > clock_timestamp()`; missing/revoked/expired → 401. Do not read Session/Booking after failed User authorization, or Booking after failed Session authorization.
8. Only an active Customer with a live Session may read the exact pair: return 200 for a committed same-pair `Booked` row with matching interval; otherwise return safe 409 mapped only from the recognized original tuple (`SLOT_UNAVAILABLE` for `23505 / booking_one_active_per_slot`; `CUSTOMER_OVERLAP` for `23P01 / booked_customer_no_overlap`). This fresh transaction takes no Slot/Booking row locks and performs no mutation. If User/Session validation is unavailable, return 503 and fail closed.

The existing Booking row is the only durable replay record; retrying same request creates no duplicate active row/history.

## 5. Read/write and privacy boundary

- F-S1-04 creates a Booking only. #15 availability remains read-only; #17 owns protected Customer list/detail and Tutor schedule Booking reads.
- Do not add `Slot.isBooked`, duplicate Tutor identity, Booking registry or second occupancy source.
- Create DTO contains only Booking ID, Slot ID, copied UTC interval, `Booked` status and request ID. Exclude Customer/Tutor IDs, profiles, contacts, credentials, Session/CSRF values and arbitrary ORM fields.
- Reuse only existing Auth fields for post-rollback revalidation: `User.id`, `User.role`, `User.isActive`, then `Session.id`, `Session.userId`, `Session.revokedAt` and `Session.expiresAt`. Read/lock the User before Session on the fresh READ COMMITTED connection. No User/Session column, Booking field, migration or second authentication schema is added by #16 Part E.
- Conflict responses must not reveal identity or Booking ID of Customer occupying a Slot.
- No retention/deletion behavior is added; BDF-D12 append-only/runtime-role rules apply.

## 6. Verification boundary

BDF-01..26 remain planned in merged #33 Part E. #33 Part F must run pre-merge BDF-01..22 and BDF-24..26. #16 Part F runs BDF-23 only after exact #33 schema SHA is merged. The exact unique/exclusion constraint identifiers above must be verified against #33 Part F before implementation; a mismatch blocks this adapter rather than widening the allowlist. No Booking schema, query, migration or database result is claimed here.
