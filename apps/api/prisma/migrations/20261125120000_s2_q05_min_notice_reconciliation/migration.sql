-- Reconcile the active Sprint 2 Booking guard with the accepted Lab 7 Q05 rule.
-- New Bookings require at least 90 minutes at post-lock T_elig, including exact equality.
-- This forward-only migration changes only booking_guard_s2()'s new-Booking predicate.
-- Q07 (Customer cancel 30m), Q10/Q11 (Reschedule 60m), and Q18 (Tutor cancel 60m)
-- remain in s2_mutate() and are intentionally unchanged.
-- CREATE OR REPLACE preserves the existing function owner and ACLs.

BEGIN;

DO $preflight$
BEGIN
  IF to_regprocedure('public.booking_guard_s2()') IS NULL THEN
    RAISE EXCEPTION 'Sprint 2 Q05 reconciliation requires public.booking_guard_s2()';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
     WHERE tgrelid = 'public."Booking"'::regclass
       AND tgname = 'booking_s2_row_guard'
       AND tgfoid = 'public.booking_guard_s2()'::regprocedure
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Sprint 2 Q05 reconciliation requires the active Booking row guard';
  END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.booking_guard_s2() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  slot_lifecycle TEXT;
  slot_starts_at TIMESTAMPTZ(6);
  slot_ends_at TIMESTAMPTZ(6);
  eligibility_time TIMESTAMPTZ(6);
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'Booking rows cannot be truncated'
      USING ERRCODE = '0A000', CONSTRAINT = 'booking_s2_truncate_forbidden';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Booking rows cannot be deleted'
      USING ERRCODE = '0A000', CONSTRAINT = 'booking_s2_delete_forbidden';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" = 'Booked' THEN
      -- Preserve accepted S1 lock/time behavior: User first, then Slot, then T_elig.
      PERFORM 1 FROM public."User" u WHERE u."id" = NEW."customerId" FOR UPDATE;
      SELECT s."lifecycle",s."startsAt" INTO slot_lifecycle,slot_starts_at
        FROM public."Slot" s WHERE s."id" = NEW."currentSlotId" FOR UPDATE;
      IF NOT FOUND THEN RETURN NEW; END IF;
      IF slot_lifecycle IS DISTINCT FROM 'Offered' THEN
        RAISE EXCEPTION 'Booking requires an Offered Slot'
          USING ERRCODE = 'P0B01', CONSTRAINT = 'booking_slot_not_offered';
      END IF;
      PERFORM public.s2_touch_slot(NEW."currentSlotId");
      eligibility_time := clock_timestamp();
      IF slot_starts_at - eligibility_time < INTERVAL '90 minutes' THEN
        RAISE EXCEPTION 'Booking is outside Q05 eligibility window; T_elig=%', eligibility_time
          USING ERRCODE = 'P0B02', CONSTRAINT = 'booking_q05_min_notice';
      END IF;
    ELSIF NEW."status" <> 'Cancelled' THEN
      RAISE EXCEPTION 'Invalid Booking status'
        USING ERRCODE = '23514', CONSTRAINT = 'booking_status_check';
    END IF;
    -- Optional disposable-fixture login; never provision it in production.
    IF NEW."status" = 'Cancelled' AND (session_user <> 'nuttiew_s2_fixture'
       OR NEW."cancellationActor" IS DISTINCT FROM 'Customer') THEN
      RAISE EXCEPTION 'Cancelled INSERT is restricted to synthetic Customer fixtures'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'Unsupported Booking operation'
      USING ERRCODE = '0A000', CONSTRAINT = 'booking_s2_operation';
  END IF;
  IF OLD."status" = 'Cancelled' THEN
    RAISE EXCEPTION 'Cancelled Booking is terminal'
      USING ERRCODE = '23514', CONSTRAINT = 'booking_s2_cancelled_terminal';
  END IF;
  IF OLD."status" <> 'Booked' THEN
    RAISE EXCEPTION 'Only Booked Booking may transition'
      USING ERRCODE = '23514', CONSTRAINT = 'booking_s2_source_state';
  END IF;

  -- Cancellation shape: preserve identity, interval and creation time. The app's
  -- transaction must acquire User/Slot/Session/Booking locks in documented order.
  IF NEW."status" = 'Cancelled' THEN
    IF NEW."id" IS DISTINCT FROM OLD."id"
       OR NEW."customerId" IS DISTINCT FROM OLD."customerId"
       OR NEW."currentSlotId" IS DISTINCT FROM OLD."currentSlotId"
       OR NEW."startsAt" IS DISTINCT FROM OLD."startsAt"
       OR NEW."endsAt" IS DISTINCT FROM OLD."endsAt"
       OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
       OR NEW."cancelledAt" IS NULL
       OR NEW."updatedAt" IS DISTINCT FROM NEW."cancelledAt"
       OR NEW."cancellationActor" IS NULL
       OR NEW."cancellationActor" NOT IN ('Customer','Tutor')
       OR (NEW."cancellationActor" = 'Customer' AND NEW."tutorCancellationReason" IS NOT NULL)
       OR (NEW."cancellationActor" = 'Tutor' AND
           (NEW."tutorCancellationReason" IS NULL OR btrim(NEW."tutorCancellationReason") = '')) THEN
      RAISE EXCEPTION 'Invalid Booking cancellation transition shape'
        USING ERRCODE = '23514', CONSTRAINT = 'booking_s2_cancel_shape';
    END IF;
    -- In the application flow Slot is already locked before Booking. The SELECT
    -- is a state backstop; it is not a substitute for the documented lock order.
    SELECT s."lifecycle" INTO slot_lifecycle
      FROM public."Slot" s WHERE s."id" = OLD."currentSlotId" FOR UPDATE;
    IF NOT FOUND OR slot_lifecycle IS DISTINCT FROM 'Offered' THEN
      RAISE EXCEPTION 'Cancellation requires the current Slot to remain Offered'
        USING ERRCODE = 'P0B01', CONSTRAINT = 'booking_slot_not_offered';
    END IF;
    PERFORM public.s2_touch_slot(OLD."currentSlotId");
    RETURN NEW;
  END IF;

  -- Reschedule shape: status stays Booked and every identity/metadata field is
  -- immutable; one exact, quota-limited history row must accompany the move.
  IF NEW."status" = 'Booked' THEN
    IF NEW."id" IS DISTINCT FROM OLD."id"
       OR NEW."customerId" IS DISTINCT FROM OLD."customerId"
       OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
       OR NEW."cancellationActor" IS NOT NULL OR NEW."cancelledAt" IS NOT NULL
       OR NEW."tutorCancellationReason" IS NOT NULL
       OR (NEW."currentSlotId" IS NOT DISTINCT FROM OLD."currentSlotId"
           AND NEW."startsAt" IS NOT DISTINCT FROM OLD."startsAt"
           AND NEW."endsAt" IS NOT DISTINCT FROM OLD."endsAt") THEN
      RAISE EXCEPTION 'Invalid Booking reschedule transition shape'
        USING ERRCODE = '23514', CONSTRAINT = 'booking_s2_reschedule_shape';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public."RescheduleHistory" h
       WHERE h."bookingId" = OLD."id"
         AND h."oldSlotId" = OLD."currentSlotId"
         AND h."oldStartsAt" = OLD."startsAt" AND h."oldEndsAt" = OLD."endsAt"
         AND h."newSlotId" = NEW."currentSlotId"
         AND h."newStartsAt" = NEW."startsAt" AND h."newEndsAt" = NEW."endsAt"
         AND h."changedAt" = NEW."updatedAt"
    ) THEN
      RAISE EXCEPTION 'Booking reschedule requires its matching immutable history row'
        USING ERRCODE = '23514', CONSTRAINT = 'booking_s2_reschedule_history_required';
    END IF;
    SELECT s."lifecycle",s."startsAt",s."endsAt" INTO slot_lifecycle,slot_starts_at,slot_ends_at
      FROM public."Slot" s WHERE s."id" = NEW."currentSlotId" FOR UPDATE;
    IF NOT FOUND OR slot_lifecycle IS DISTINCT FROM 'Offered'
       OR slot_starts_at IS DISTINCT FROM NEW."startsAt" OR slot_ends_at IS DISTINCT FROM NEW."endsAt"
       OR EXISTS (SELECT 1 FROM public."Booking" b WHERE b."currentSlotId"=NEW."currentSlotId" AND b."status"='Booked' AND b."id"<>OLD."id") THEN
      RAISE EXCEPTION 'Reschedule destination must be Offered, interval-matched and unoccupied'
        USING ERRCODE = 'P0B01', CONSTRAINT = 'booking_slot_not_offered';
    END IF;
    PERFORM public.s2_touch_slot(LEAST(OLD."currentSlotId", NEW."currentSlotId"));
    PERFORM public.s2_touch_slot(GREATEST(OLD."currentSlotId", NEW."currentSlotId"));
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Unsupported Booking transition'
    USING ERRCODE = '23514', CONSTRAINT = 'booking_s2_transition_forbidden';
END;
$function$;

COMMIT;
