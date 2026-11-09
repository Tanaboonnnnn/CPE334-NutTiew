-- Forward-only migration for Issue #39 (Shared Booking Data Foundation Remediation)
-- Replaces booking_guard_s1() to acquire User(customerId) FOR UPDATE in BEFORE ROW trigger
-- before Slot lock and before heap/index insertion, with SECURITY DEFINER to allow runtime/probe roles to lock User.

CREATE OR REPLACE FUNCTION public.booking_guard_s1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  slot_lifecycle text;
  slot_starts_at timestamptz(6);
  eligibility_time timestamptz(6);
BEGIN
  -- The same function is registered for row DML and statement TRUNCATE.
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'Sprint 1 Booking rows cannot be truncated'
      USING ERRCODE = '0A000';
  END IF;

  -- Every row UPDATE/DELETE is rejected before inspecting NEW/OLD or locking Slot.
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Sprint 1 Booking rows are append-only'
      USING ERRCODE = '0A000';
  END IF;

  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Unsupported Booking operation'
      USING ERRCODE = '0A000';
  END IF;

  -- Cancelled fixtures are permitted for shared-state tests, but do not occupy.
  IF NEW."status" = 'Booked' THEN
    -- Lock Customer User row FOR UPDATE in BEFORE ROW trigger before Slot lock and before index insertion.
    -- If customerId is not found, the query returns 0 rows without failing, allowing the composite FK to raise.
    PERFORM 1
      FROM public."User" AS u
     WHERE u."id" = NEW."customerId"
       FOR UPDATE;

    SELECT s."lifecycle", s."startsAt"
      INTO slot_lifecycle, slot_starts_at
      FROM public."Slot" AS s
     WHERE s."id" = NEW."currentSlotId"
       FOR UPDATE;

    IF NOT FOUND THEN
      -- Let the named composite FK report a missing Slot (BDF-08).
      RETURN NEW;
    END IF;

    IF slot_lifecycle IS DISTINCT FROM 'Offered' THEN
      RAISE EXCEPTION 'Booking requires an Offered Slot'
        USING ERRCODE = 'P0B01', CONSTRAINT = 'booking_slot_not_offered';
    END IF;

    -- Sample the authoritative DB wall clock only after the User and Slot lock waits.
    eligibility_time := clock_timestamp();
    IF slot_starts_at - eligibility_time < INTERVAL '60 minutes' THEN
      RAISE EXCEPTION 'Booking is outside the Sprint 1 eligibility window; T_elig=%', eligibility_time
        USING ERRCODE = 'P0B02', CONSTRAINT = 'booking_q05_min_notice';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
