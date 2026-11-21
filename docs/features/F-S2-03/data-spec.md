# F-S2-03 — Tutor Cancellation Data Contract (Part E)

> **Proposed data contract for independent review; no Prisma model, SQL migration, trigger, index or database test is added by Issue #114.** Every SQL fragment below is **illustrative and NOT EXECUTED**.

## 1. Canonical source and ownership

`Booking`, `Slot` and their Sprint 1 constraints remain owned by the accepted migrations. This feature adds shared Booking cancellation metadata, a new `Notification` table, and two reviewed guard replacements: `booking_guard_s2()` (shared with F-S2-01/02) and `slot_guard_s2()` (shared with F-S2-05). No applied migration is edited.

## 2. Booking fields written by Tutor cancellation

| Field | Rule |
|---|---|
| `id` / `customerId` / `currentSlotId` / `startsAt` / `endsAt` | Unchanged |
| `status` | `Booked → Cancelled` |
| `cancellationActor` | `'Tutor'` |
| `cancelledAt` | `T_elig` |
| `tutorCancellationReason` | Trimmed nonblank reason; required on this path |
| `updatedAt` | `T_elig` |

## 3. Slot withdrawal (new guard, shared with F-S2-05)

```sql
-- PROPOSED, NOT EXECUTED.
CREATE OR REPLACE FUNCTION public.slot_guard_s2() RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."lifecycle" <> 'Offered' OR NEW."withdrawnAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Sprint 2 Slot inserts must be Offered'
        USING ERRCODE = '23514', CONSTRAINT = 'slot_s2_insert_lifecycle';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'Slot delete/truncate is forbidden'
      USING ERRCODE = '0A000';
  END IF;

  IF OLD."lifecycle" = 'Withdrawn' THEN
    RAISE EXCEPTION 'Withdrawn Slot cannot be reactivated'
      USING ERRCODE = 'P0B04', CONSTRAINT = 'slot_reactivation_forbidden';
  END IF;

  IF NEW."lifecycle" <> 'Withdrawn' OR NEW."withdrawnAt" IS NULL
     OR NEW."id" <> OLD."id" OR NEW."tutorId" <> OLD."tutorId"
     OR NEW."startsAt" <> OLD."startsAt" OR NEW."endsAt" <> OLD."endsAt" THEN
    RAISE EXCEPTION 'Only one-way Offered -> Withdrawn is allowed'
      USING ERRCODE = '23514', CONSTRAINT = 'slot_s2_immutable';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public."Booking" AS b
    WHERE b."currentSlotId" = OLD."id" AND b."status" = 'Booked'
  ) THEN
    RAISE EXCEPTION 'Occupied Slot cannot be withdrawn'
      USING ERRCODE = 'P0B03', CONSTRAINT = 'slot_withdraw_occupied';
  END IF;

  RETURN NEW;
END;
$function$;
```

The reviewed migration replaces the S1 triggers with this function on `BEFORE INSERT` and `BEFORE UPDATE OR DELETE`, keeps a `BEFORE TRUNCATE` guard, and preserves the existing `slot_lifecycle_consistent` CHECK. Exact trigger names and firing order must be proven in Part F. The runtime role must not be able to disable the trigger.

## 4. Notification (new table, created here; read by F-S2-04)

```sql
-- PROPOSED, NOT EXECUTED.
CREATE TABLE "Notification" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "recipientCustomerId" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL,
  "readAt" TIMESTAMPTZ(6),
  CONSTRAINT notification_kind_check CHECK ("kind" IN ('TutorCancelled')),
  CONSTRAINT notification_read_after_create CHECK ("readAt" IS NULL OR "readAt" >= "createdAt"),
  CONSTRAINT notification_recipient_fk FOREIGN KEY ("recipientCustomerId")
    REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT notification_booking_fk FOREIGN KEY ("bookingId")
    REFERENCES "Booking" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX notification_one_per_booking_kind
  ON "Notification" ("bookingId", "kind");
CREATE INDEX notification_recipient_created_idx
  ON "Notification" ("recipientCustomerId", "createdAt" DESC, "id" DESC);
```

- The reason is **not duplicated** in the notice; F-S2-04 projects it from the owning Booking. This avoids divergence and keeps the reason under one authorization path.
- One notice per `(bookingId, kind)`; a second Tutor cancellation is impossible because `Cancelled` is terminal.
- A `notification_guard_s2()` trigger must reject DELETE/TRUNCATE and every UPDATE except `readAt: NULL → timestamp` (F-S2-04).
- No expiry column and no automatic deletion; OD-008 remains open.

## 5. Shared Booking guard requirements

`booking_guard_s2()` must accept the Tutor-cancel shape (`status='Cancelled'`, actor `Tutor`, nonblank reason, identity/interval unchanged, referenced Slot still `Offered`) and the Customer-cancel/reschedule shapes defined in F-S2-01/F-S2-02. It rejects every other UPDATE, DELETE and TRUNCATE. See [F-S2-01 data](../F-S2-01/data-spec.md) §4 and [F-S2-02 data](../F-S2-02/data-spec.md) §4.

## 6. Transaction order and persistence proof

Required order inside one transaction: lock Users → Slot → Session → Booking; revalidate; **UPDATE Booking to Cancelled**; **UPDATE Slot to Withdrawn**; **INSERT Notification**; COMMIT.

- Final rows: Booking `Cancelled` actor Tutor with reason; Slot `Withdrawn` with `withdrawnAt`; exactly one notice for `Booking.customerId`.
- Failure at any point rolls back all three; no Cancelled row, no Withdrawn Slot, no notice.
- Direct SQL withdrawal of an occupied Slot is rejected by `slot_guard_s2()` (`P0B03`); direct `Withdrawn → Offered` is rejected (`P0B04`).
- A second notice insert for the same Booking is rejected by the unique index.
- The withdrawn Slot no longer appears in availability; it does not block a later distinct overlapping offer (F-S2-05).

## 7. DTO and privacy

- The Tutor mutation response contains Booking ID, Slot ID, interval, `status='Cancelled'` and `cancelledAt` only; no reason, Customer reference or notice ID.
- The owning Customer sees the reason in F-S2-04's notice and cancelled Booking detail; no other role does.
- The shared Sprint 2 Booking DTO extension is defined in [F-S2-01 data](../F-S2-01/data-spec.md) §6.

## 8. No-change layers

- No change to `slot_exactly_one_hour`, `offered_slot_no_overlap_per_tutor`, `slot_id_window_unique`.
- No change to `booking_one_active_per_slot`, `booked_customer_no_overlap`, `booking_current_slot_window_fk`.
- No change to auth/session tables or Sprint 1 Slot creation.
- No retention/deletion policy (OD-008).

## 9. Open decisions and migration risks

- **OD-014:** "meaningful" and length policy are open; only trim-and-nonblank is fixed.
- **OD-008:** notice/reason retention and deletion are open.
- **OD-013:** duplicate/uncertain cancel protocol is open.
- **Migration risk:** the S1 Slot guard forbids all updates. Enabling withdrawal without the reviewed S2 guard would either fail or, if the guard were naively removed, permit occupied-Slot withdrawal and same-ID reactivation. Both are release blockers.
