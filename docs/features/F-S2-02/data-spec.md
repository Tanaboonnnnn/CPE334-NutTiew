# F-S2-02 — Customer Reschedule Data Contract (Part E)

> **Proposed data contract for independent review; no Prisma model, SQL migration, trigger, index or database test is added by Issue #114.** Every SQL fragment below is **illustrative and NOT EXECUTED**.

## 1. Canonical source and ownership

`Booking`, `Slot`, the composite Slot-window FK, `booking_one_active_per_slot` and `booked_customer_no_overlap` remain owned by the accepted Sprint 1 migrations. This feature adds one `RescheduleHistory` table, Booking cancellation metadata shared with F-S2-01/03, and the shared `booking_guard_s2()` replacement in a **new forward-only migration**. No applied migration is edited.

## 2. Booking fields written by reschedule

| Field | Rule |
|---|---|
| `id` | Unchanged |
| `customerId` | Unchanged; must equal `principal.userId` |
| `currentSlotId` | Set to the destination Slot |
| `startsAt` / `endsAt` | Set to the destination Slot interval (composite FK) |
| `status` | Stays `Booked` |
| `cancellationActor` / `cancelledAt` / `tutorCancellationReason` | Stay `NULL` |
| `updatedAt` | Set to `T_elig` |

`Slot` rows are **not** written. The original stays `Offered`; the destination stays `Offered`. Occupancy changes only through `Booking.currentSlotId`/`status`.

## 3. RescheduleHistory (new table, proposed)

```sql
-- PROPOSED, NOT EXECUTED.
CREATE TABLE "RescheduleHistory" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "bookingId" UUID NOT NULL,
  "oldSlotId" UUID NOT NULL,
  "oldTutorId" UUID NOT NULL,
  "oldStartsAt" TIMESTAMPTZ(6) NOT NULL,
  "oldEndsAt" TIMESTAMPTZ(6) NOT NULL,
  "newSlotId" UUID NOT NULL,
  "newTutorId" UUID NOT NULL,
  "newStartsAt" TIMESTAMPTZ(6) NOT NULL,
  "newEndsAt" TIMESTAMPTZ(6) NOT NULL,
  "changedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT reschedule_history_booking_unique UNIQUE ("bookingId"),
  CONSTRAINT reschedule_history_distinct_slots CHECK ("oldSlotId" <> "newSlotId"),
  CONSTRAINT reschedule_history_old_positive CHECK ("oldStartsAt" < "oldEndsAt"),
  CONSTRAINT reschedule_history_new_positive CHECK ("newStartsAt" < "newEndsAt"),
  CONSTRAINT reschedule_history_booking_fk FOREIGN KEY ("bookingId")
    REFERENCES "Booking" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT reschedule_history_old_slot_fk FOREIGN KEY ("oldSlotId")
    REFERENCES "Slot" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT reschedule_history_new_slot_fk FOREIGN KEY ("newSlotId")
    REFERENCES "Slot" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
```

- `UNIQUE(bookingId)` is the database quota: at most one successful reschedule per Booking.
- No `tutorId` is added to `Booking`; old/new Tutor are recorded from the two Slots.
- The row is immutable: a `reschedule_history_guard_s2()` trigger must reject UPDATE, DELETE and TRUNCATE. A rejected reschedule inserts no row.
- History is written **before** the Booking update in the same transaction; the shared Booking guard verifies the matching row.

## 4. Shared `booking_guard_s2()` requirement

The guard replaces `booking_s1_row_guard`/`booking_guard_s1()` and must accept exactly two UPDATE shapes:

| Shape | Required checks |
|---|---|
| Customer/Tutor cancellation | `customerId`, `currentSlotId`, `startsAt`, `endsAt` unchanged; `status='Cancelled'`; actor and `cancelledAt` set; Tutor reason nonblank; referenced Slot still `Offered` (the Tutor path withdraws it **after** this update). |
| Reschedule | `customerId` unchanged; `status='Booked'`; `currentSlotId`/interval changed; destination Slot exists, is `Offered`, and matches the new interval; no other `Booked` row occupies the destination; a `RescheduleHistory` row exists for this Booking with `oldSlotId/oldStartsAt/oldEndsAt` matching `OLD` and `newSlotId/newStartsAt/newEndsAt` matching `NEW`. |

Every other UPDATE, every `Cancelled → *`, every DELETE and every TRUNCATE is rejected with a non-success SQLSTATE. The guard must not be disablable by the runtime role. Exact trigger firing order and lock interaction must be proven on PostgreSQL 18 in Part F.

## 5. Transaction and persistence proof

- One history INSERT and one Booking UPDATE commit or roll back together; the test asserts exactly one history row and one moved Booking.
- After COMMIT, the original Slot is `Offered`/unoccupied and the destination is `Offered`/occupied.
- An injected failure after the history INSERT and before COMMIT leaves no history row and no moved Booking.
- A destination collision rolls back both; the allowance is still available.
- A second concurrent attempt cannot create a second history row; `UNIQUE(bookingId)` is the backstop.
- Direct SQL that updates `Booking.currentSlotId` without a matching history row is rejected by the guard; direct UPDATE/DELETE of history is rejected by its own guard.

## 6. DTO extension

- The reschedule response reuses the F-S1-05 Booking detail shape with the new `slotId`/`startsAt`/`endsAt`/`tutorId`/`tutorRef` and `updatedAt`.
- No `history`, previous-Tutor or `rescheduled` flag is added; OD-015 is open.
- The shared Sprint 2 DTO extension (`status: 'Booked'|'Cancelled'`, `displayStatus`, cancellation fields) is defined in [F-S2-01 data](../F-S2-01/data-spec.md) §6 and must be regression-tested.

## 7. No-change layers

- No `Slot` column, constraint, index or guard change.
- No change to `booking_one_active_per_slot`, `booked_customer_no_overlap`, `booking_current_slot_window_fk` or `slot_id_window_unique`.
- No change to auth/session tables.
- No history read API and no retention/deletion policy (OD-008).

## 8. Open decisions and migration risks

- **OD-013:** duplicate/uncertain reschedule protocol is open.
- **OD-015:** previous-Tutor visibility is open; history exists but is not exposed.
- **OD-008:** history retention is open.
- **Migration risk:** replacing the append-only S1 guard is a shared change for F-S2-01/02/03. It must be one reviewed migration with tests proving the S1 INSERT/Q05 behaviour is unchanged. A second, conflicting trigger is not acceptable.
