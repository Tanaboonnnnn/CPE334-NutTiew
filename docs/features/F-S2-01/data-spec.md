# F-S2-01 — Customer Cancellation Data Contract (Part E)

> **Proposed data contract for independent review; no Prisma model, SQL migration, trigger, index or database test is added by Issue #114.** Every SQL fragment below is **illustrative and NOT EXECUTED**.

## 1. Canonical source and ownership

The Booking entity, keys, composite Slot-window FK, `booking_one_active_per_slot` partial unique index and `booked_customer_no_overlap` exclusion are owned by the accepted Sprint 1 migration `20261107000000_booking_foundation` and are not redefined here. This feature adds cancellation metadata and a replacement Booking guard in a **new forward-only migration**; it never edits an applied migration.

## 2. Fields written by Customer cancellation

| Field | Type | F-S2-01 rule |
|---|---|---|
| `id` | UUID PK | Path identifier; never changed |
| `customerId` | UUID FK → `User.id` | Must equal `principal.userId`; never changed |
| `currentSlotId` | UUID FK → `Slot.id` | Never changed |
| `startsAt` / `endsAt` | `TIMESTAMPTZ(6)` | Never changed; copied Slot interval |
| `status` | `TEXT` `Booked`/`Cancelled` | `Booked → Cancelled` only |
| `cancellationActor` | `TEXT NULL` (new) | `'Customer'` on this path |
| `cancelledAt` | `TIMESTAMPTZ(6) NULL` (new) | Set to the same `T_elig` instant used for the cutoff |
| `tutorCancellationReason` | `TEXT NULL` (new) | Always `NULL` on this path |
| `updatedAt` | `TIMESTAMPTZ(6)` | Explicitly set to `T_elig` by the raw-SQL update |

`Slot` is **not** written. `lifecycle` stays `Offered`, `withdrawnAt` stays `NULL`, and occupancy changes only because `Booking.status` is no longer `Booked`.

## 3. Constraints (proposed)

```sql
-- PROPOSED, NOT EXECUTED.
ALTER TABLE "Booking"
  ADD COLUMN "cancellationActor" TEXT,
  ADD COLUMN "cancelledAt" TIMESTAMPTZ(6),
  ADD COLUMN "tutorCancellationReason" TEXT;

ALTER TABLE "Booking"
  ADD CONSTRAINT booking_cancellation_consistent CHECK (
    ("status" = 'Booked'
      AND "cancellationActor" IS NULL
      AND "cancelledAt" IS NULL
      AND "tutorCancellationReason" IS NULL)
    OR
    ("status" = 'Cancelled'
      AND "cancellationActor" IN ('Customer', 'Tutor')
      AND "cancelledAt" IS NOT NULL
      AND (
        ("cancellationActor" = 'Customer' AND "tutorCancellationReason" IS NULL)
        OR
        ("cancellationActor" = 'Tutor'
          AND "tutorCancellationReason" IS NOT NULL
          AND btrim("tutorCancellationReason") <> '')
      ))
  );
```

**Migration precondition:** Sprint 1's guard rejected Booking UPDATEs, so the application never created `Cancelled` rows; any existing `Cancelled` fixture rows were inserted directly. Before adding `booking_cancellation_consistent`, the reviewed migration must inventory those rows and reconcile them truthfully (or refuse to apply). It must **not** guess an actor. A migration that silently backfills `'Customer'` is rejected by this contract.

## 4. Guard replacement requirement

`booking_s1_row_guard` / `booking_guard_s1()` currently raises `0A000` for every UPDATE, DELETE and TRUNCATE. F-S2-01 is blocked until a reviewed forward migration installs `booking_guard_s2()` with these rules:

| Operation | Rule |
|---|---|
| INSERT `Booked` | Keep the Sprint 1 behaviour: lock Customer User and Slot, require `Slot.lifecycle='Offered'`, matching interval, and Q05 at `T_elig`. |
| INSERT `Cancelled` | Permitted only for controlled fixtures and only when the cancellation-consistency CHECK passes; never occupies. |
| UPDATE `Booked → Cancelled` (Customer) | Require unchanged `customerId`, `currentSlotId`, `startsAt`, `endsAt`; require `cancellationActor='Customer'`, `tutorCancellationReason IS NULL`; lock the Slot and require `lifecycle='Offered'`. |
| UPDATE `Booked → Cancelled` (Tutor) | Same unchanged identity/interval; require `cancellationActor='Tutor'` and a nonblank reason. F-S2-03 additionally withdraws the Slot **after** this update in the same transaction. |
| UPDATE reschedule shape | Only the F-S2-02 shape: `status` stays `Booked`, `customerId` unchanged, `currentSlotId`/interval move to an `Offered` destination. See [F-S2-02 data](../F-S2-02/data-spec.md). |
| UPDATE `Cancelled → *` | Reject unconditionally. |
| UPDATE identity/interval outside an approved shape | Reject. |
| DELETE / TRUNCATE | Reject unconditionally. |

The guard must raise a non-success error so the whole transaction rolls back; the runtime role must not be able to disable triggers. Exact SQL, trigger firing order and lock interaction must be proven on a disposable PostgreSQL 18 database in the implementation Issue.

## 5. Transaction and persistence proof

- One `UPDATE` statement affects exactly one row; the test asserts `rowCount = 1`.
- The Slot row's `lifecycle`, `withdrawnAt`, `startsAt`, `endsAt`, `tutorId` are unchanged; the Booking row's `currentSlotId`, `startsAt`, `endsAt`, `customerId` are unchanged.
- After COMMIT, a fresh connection sees the Booking `Cancelled`; `booking_one_active_per_slot` no longer blocks the Slot.
- An injected failure after the UPDATE and before COMMIT leaves the previous `Booked` row and occupancy intact.
- A second concurrent cancel cannot produce a second row version transition; the loser observes `Cancelled`.

## 6. DTO extension (Sprint 2 change layer)

F-S1-05 currently hardcodes `status:'Booked'` and `displayStatus:'Booked'|'Past'`. F-S2-01 requires:

| Field | New values |
|---|---|
| `status` | `'Booked' \| 'Cancelled'` |
| `displayStatus` | `'Booked' \| 'Past' \| 'Cancelled'`; `Cancelled` wins over `Past` |
| `cancellationActor` | `'Customer' \| 'Tutor' \| null` |
| `cancelledAt` | ISO string or `null` |
| `cancellationReason` | string only for the owner of a Tutor-cancelled Booking, otherwise `null` |

This is a **change to accepted Sprint 1 retrieval output**. It must be covered by Sprint 1 regression tests and may not be deployed over the Lab 6 UAT release. Tutor schedule output (`/api/v1/tutor/bookings`) remains `Booked`-only in S2.

## 7. No-change layers

- No `Slot` column, constraint, index or guard change.
- No change to `booking_one_active_per_slot` or `booked_customer_no_overlap`.
- No new table.
- No change to auth/session tables.
- No retention/delete policy (OD-008).

## 8. Open decisions

- **OD-013:** idempotency/replay protocol for a repeated or uncertain cancel is not defined.
- **OD-008:** deletion/retention of Cancelled history is not authorized.
- **OD-014:** applies only to Tutor reasons (F-S2-03), not this path.
