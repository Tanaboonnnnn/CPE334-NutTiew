-- REVIEW CANDIDATE: NOT APPROVED FOR SHARED OR PRODUCTION DEPLOYMENT.
-- Shared Sprint 2 Booking/Slot transition foundation for F-S2-01..05.
-- Disposable pull-request CI is allowed; require human review before merging.
-- Forward-only: never edit/rewrite the accepted Sprint 1 migrations.

BEGIN;
-- Fail closed instead of waiting indefinitely in the migration lock queue.
-- The statement limit is per statement, not a bound on the entire cutover.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';
LOCK TABLE public."Slot", public."Booking" IN ACCESS EXCLUSIVE MODE;

-- Refuse rather than invent provenance for any pre-existing Cancelled row.
DO $preflight$
BEGIN
  IF EXISTS (SELECT 1 FROM public."Booking" WHERE "status" = 'Cancelled') THEN
    RAISE EXCEPTION 'S2 migration refused: existing Cancelled Booking rows require truthful owner-approved reconciliation'
      USING ERRCODE = 'P0001';
  END IF;
END;
$preflight$;

ALTER TABLE public."Booking"
  ADD COLUMN "cancellationActor" TEXT,
  ADD COLUMN "cancelledAt" TIMESTAMPTZ(6),
  ADD COLUMN "tutorCancellationReason" TEXT;

ALTER TABLE public."Booking"
  ADD CONSTRAINT booking_cancellation_consistent CHECK (
    ("status" = 'Booked'
      AND "cancellationActor" IS NULL
      AND "cancelledAt" IS NULL
      AND "tutorCancellationReason" IS NULL)
    OR
    ("status" = 'Cancelled'
      AND "cancellationActor" IS NOT NULL
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

CREATE TABLE public."RescheduleHistory" (
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
    REFERENCES public."Booking" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT reschedule_history_old_slot_fk FOREIGN KEY ("oldSlotId")
    REFERENCES public."Slot" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT reschedule_history_new_slot_fk FOREIGN KEY ("newSlotId")
    REFERENCES public."Slot" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE public."Notification" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "recipientCustomerId" UUID NOT NULL,
  "bookingId" UUID NOT NULL,
  "kind" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL,
  "readAt" TIMESTAMPTZ(6),
  CONSTRAINT notification_kind_check CHECK ("kind" IN ('TutorCancelled')),
  CONSTRAINT notification_read_after_create CHECK ("readAt" IS NULL OR "readAt" >= "createdAt"),
  CONSTRAINT notification_recipient_fk FOREIGN KEY ("recipientCustomerId")
    REFERENCES public."User" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT notification_booking_fk FOREIGN KEY ("bookingId")
    REFERENCES public."Booking" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE UNIQUE INDEX notification_one_per_booking_kind
  ON public."Notification" ("bookingId", "kind");
CREATE INDEX notification_recipient_created_idx
  ON public."Notification" ("recipientCustomerId", "createdAt" DESC, "id" DESC);

-- A valid history INSERT must describe the current, still-Booked old assignment;
-- the deferred constraint trigger below prevents committing history without its matching move.
CREATE FUNCTION public.reschedule_history_guard_s2() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE
  b_customer UUID;
  b_slot UUID;
  b_start TIMESTAMPTZ(6);
  b_end TIMESTAMPTZ(6);
  old_tutor UUID;
  new_tutor UUID;
  new_lifecycle TEXT;
  new_start TIMESTAMPTZ(6);
  new_end TIMESTAMPTZ(6);
BEGIN
  IF TG_OP = 'TRUNCATE' OR TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Reschedule history is immutable'
      USING ERRCODE = '0A000', CONSTRAINT = 'reschedule_history_immutable';
  END IF;
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Unsupported RescheduleHistory operation'
      USING ERRCODE = '0A000', CONSTRAINT = 'reschedule_history_operation';
  END IF;
  SELECT b."customerId", b."currentSlotId", b."startsAt", b."endsAt"
    INTO b_customer, b_slot, b_start, b_end
    FROM public."Booking" b WHERE b."id" = NEW."bookingId" AND b."status" = 'Booked';
  IF NOT FOUND OR b_slot IS DISTINCT FROM NEW."oldSlotId"
     OR b_start IS DISTINCT FROM NEW."oldStartsAt" OR b_end IS DISTINCT FROM NEW."oldEndsAt" THEN
    RAISE EXCEPTION 'Reschedule history does not match current Booking assignment'
      USING ERRCODE = '23514', CONSTRAINT = 'reschedule_history_old_assignment';
  END IF;
  SELECT s."tutorId" INTO old_tutor FROM public."Slot" s WHERE s."id"=NEW."oldSlotId";
  SELECT s."tutorId",s."lifecycle",s."startsAt",s."endsAt"
    INTO new_tutor,new_lifecycle,new_start,new_end
    FROM public."Slot" s WHERE s."id"=NEW."newSlotId";
  IF old_tutor IS DISTINCT FROM NEW."oldTutorId"
     OR new_tutor IS DISTINCT FROM NEW."newTutorId"
     OR new_lifecycle IS DISTINCT FROM 'Offered'
     OR new_start IS DISTINCT FROM NEW."newStartsAt"
     OR new_end IS DISTINCT FROM NEW."newEndsAt"
     OR NEW."changedAt" IS NULL THEN
    RAISE EXCEPTION 'Reschedule history does not match Slot snapshots'
      USING ERRCODE = '23514', CONSTRAINT = 'reschedule_history_slot_snapshot';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE FUNCTION public.reschedule_history_commit_guard_s2() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public."Booking" b
     WHERE b."id" = NEW."bookingId" AND b."status" = 'Booked'
       AND b."currentSlotId" = NEW."newSlotId"
       AND b."startsAt" = NEW."newStartsAt" AND b."endsAt" = NEW."newEndsAt"
        AND b."updatedAt" = NEW."changedAt"
       AND b."cancellationActor" IS NULL AND b."cancelledAt" IS NULL
       AND b."tutorCancellationReason" IS NULL
  ) THEN
    RAISE EXCEPTION 'Reschedule history must commit with the matching Booking move'
      USING ERRCODE = '23514', CONSTRAINT = 'reschedule_history_requires_move';
  END IF;
  RETURN NULL;
END;
$function$;
CREATE CONSTRAINT TRIGGER reschedule_history_commit_guard
  AFTER INSERT ON public."RescheduleHistory"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION public.reschedule_history_commit_guard_s2();
CREATE TRIGGER reschedule_history_row_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public."RescheduleHistory"
  FOR EACH ROW EXECUTE FUNCTION public.reschedule_history_guard_s2();
CREATE TRIGGER reschedule_history_truncate_guard
  BEFORE TRUNCATE ON public."RescheduleHistory"
  FOR EACH STATEMENT EXECUTE FUNCTION public.reschedule_history_guard_s2();

CREATE TABLE public.s2_slot_guard (slot_id uuid PRIMARY KEY REFERENCES public."Slot"("id"), version bigint NOT NULL DEFAULT 0);
INSERT INTO public.s2_slot_guard(slot_id) SELECT "id" FROM public."Slot";
CREATE FUNCTION public.s2_touch_slot(p_slot uuid) RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, pg_temp AS $s2_guard$
BEGIN
  UPDATE public.s2_slot_guard SET version = version + 1 WHERE slot_id = p_slot;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missing Slot guard' USING ERRCODE = '23514'; END IF;
END;
$s2_guard$;
REVOKE ALL ON FUNCTION public.s2_touch_slot(uuid) FROM PUBLIC;
CREATE FUNCTION public.s2_init_slot_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $s2_guard$
BEGIN
  INSERT INTO public.s2_slot_guard(slot_id) VALUES (NEW."id");
  RETURN NULL;
END;
$s2_guard$;
CREATE TRIGGER s2_init_slot_guard AFTER INSERT ON public."Slot"
FOR EACH ROW EXECUTE FUNCTION public.s2_init_slot_guard();
REVOKE ALL ON FUNCTION public.s2_init_slot_guard() FROM PUBLIC;

CREATE FUNCTION public.booking_guard_s2() RETURNS trigger
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
      IF slot_starts_at - eligibility_time < INTERVAL '60 minutes' THEN
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

CREATE FUNCTION public.notification_guard_s2() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
DECLARE b_customer UUID; b_actor TEXT; b_status TEXT;
BEGIN
  IF TG_OP = 'TRUNCATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Notification content is immutable and cannot be deleted'
      USING ERRCODE = '0A000', CONSTRAINT = 'notification_s2_delete_forbidden';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."kind" IS DISTINCT FROM 'TutorCancelled' OR NEW."readAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Only unread TutorCancelled notices may be inserted'
        USING ERRCODE = '23514', CONSTRAINT = 'notification_s2_insert_shape';
    END IF;
    SELECT b."customerId",b."cancellationActor",b."status"
      INTO b_customer,b_actor,b_status FROM public."Booking" b WHERE b."id"=NEW."bookingId";
    IF NOT FOUND OR b_customer IS DISTINCT FROM NEW."recipientCustomerId"
       OR b_actor IS DISTINCT FROM 'Tutor' OR b_status IS DISTINCT FROM 'Cancelled'
       OR NOT EXISTS (SELECT 1 FROM public."Booking" b JOIN public."Slot" s ON s."id" = b."currentSlotId"
                      WHERE b."id" = NEW."bookingId" AND b."cancelledAt" = NEW."createdAt"
                        AND s."lifecycle" = 'Withdrawn' AND s."withdrawnAt" = NEW."createdAt") THEN
      RAISE EXCEPTION 'Notification must belong to a Tutor-cancelled Booking owner'
        USING ERRCODE = '23514', CONSTRAINT = 'notification_s2_recipient_booking';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW."id" IS DISTINCT FROM OLD."id"
       OR NEW."recipientCustomerId" IS DISTINCT FROM OLD."recipientCustomerId"
       OR NEW."bookingId" IS DISTINCT FROM OLD."bookingId"
       OR NEW."kind" IS DISTINCT FROM OLD."kind"
       OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt"
       OR (OLD."readAt" IS NOT NULL AND NEW."readAt" IS DISTINCT FROM OLD."readAt")
       OR (NEW."readAt" IS NOT NULL AND NEW."readAt" < NEW."createdAt") THEN
      RAISE EXCEPTION 'Only Notification readAt NULL-to-timestamp or no-op is permitted'
        USING ERRCODE = '23514', CONSTRAINT = 'notification_s2_update_shape';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Unsupported Notification operation'
    USING ERRCODE = '0A000', CONSTRAINT = 'notification_s2_operation';
END;
$function$;

CREATE FUNCTION public.slot_guard_s2() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $function$
BEGIN
  IF TG_OP = 'TRUNCATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Slot rows cannot be deleted or truncated'
      USING ERRCODE = '0A000', CONSTRAINT = 'slot_s2_delete_forbidden';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."lifecycle" IS DISTINCT FROM 'Offered' OR NEW."withdrawnAt" IS NOT NULL THEN
      RAISE EXCEPTION 'New Slot must be Offered'
        USING ERRCODE = '23514', CONSTRAINT = 'slot_s2_insert_lifecycle';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP <> 'UPDATE' THEN
    RAISE EXCEPTION 'Unsupported Slot operation'
      USING ERRCODE = '0A000', CONSTRAINT = 'slot_s2_operation';
  END IF;
  IF OLD."lifecycle" = 'Withdrawn' THEN
    RAISE EXCEPTION 'Withdrawn Slot cannot be reactivated'
      USING ERRCODE = 'P0B04', CONSTRAINT = 'slot_reactivation_forbidden';
  END IF;
  IF OLD."lifecycle" <> 'Offered'
     OR NEW."lifecycle" IS DISTINCT FROM 'Withdrawn'
     OR NEW."withdrawnAt" IS NULL
     OR NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."tutorId" IS DISTINCT FROM OLD."tutorId"
     OR NEW."startsAt" IS DISTINCT FROM OLD."startsAt"
     OR NEW."endsAt" IS DISTINCT FROM OLD."endsAt"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'Only immutable Offered-to-Withdrawn transition is permitted'
      USING ERRCODE = '23514', CONSTRAINT = 'slot_s2_immutable';
  END IF;
  PERFORM public.s2_touch_slot(OLD."id");
  IF EXISTS (SELECT 1 FROM public."Booking" b WHERE b."currentSlotId"=OLD."id" AND b."status"='Booked') THEN
    RAISE EXCEPTION 'Occupied Slot cannot be withdrawn'
      USING ERRCODE = 'P0B03', CONSTRAINT = 'slot_withdraw_occupied';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE FUNCTION public.booking_tutor_cancel_commit_guard_s2() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $complete$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public."Notification" n JOIN public."Slot" s ON s."id"=NEW."currentSlotId"
    WHERE n."bookingId"=NEW."id" AND n."recipientCustomerId"=NEW."customerId"
    AND n."kind"='TutorCancelled' AND n."createdAt"=NEW."cancelledAt"
    AND s."lifecycle"='Withdrawn' AND s."withdrawnAt"=NEW."cancelledAt") THEN
    RAISE EXCEPTION 'Incomplete Tutor cancellation' USING ERRCODE='23514';
  END IF;
  RETURN NULL;
END;
$complete$;
DROP TRIGGER booking_s1_row_guard ON public."Booking";
DROP TRIGGER booking_s1_truncate_guard ON public."Booking";
DROP FUNCTION public.booking_guard_s1();
CREATE TRIGGER booking_s2_row_guard BEFORE INSERT OR UPDATE OR DELETE ON public."Booking" FOR EACH ROW EXECUTE FUNCTION public.booking_guard_s2();
CREATE TRIGGER booking_s2_truncate_guard BEFORE TRUNCATE ON public."Booking" FOR EACH STATEMENT EXECUTE FUNCTION public.booking_guard_s2();
DROP TRIGGER slot_s1_insert_guard ON public."Slot";
DROP TRIGGER slot_s1_update_delete_guard ON public."Slot";
DROP TRIGGER slot_s1_truncate_guard ON public."Slot";
DROP FUNCTION public.slot_guard_s1();
CREATE TRIGGER slot_s2_row_guard BEFORE INSERT OR UPDATE OR DELETE ON public."Slot" FOR EACH ROW EXECUTE FUNCTION public.slot_guard_s2();
CREATE TRIGGER slot_s2_truncate_guard BEFORE TRUNCATE ON public."Slot" FOR EACH STATEMENT EXECUTE FUNCTION public.slot_guard_s2();
CREATE TRIGGER notification_s2_row_guard BEFORE INSERT OR UPDATE OR DELETE ON public."Notification" FOR EACH ROW EXECUTE FUNCTION public.notification_guard_s2();
CREATE TRIGGER notification_s2_truncate_guard BEFORE TRUNCATE ON public."Notification" FOR EACH STATEMENT EXECUTE FUNCTION public.notification_guard_s2();
CREATE CONSTRAINT TRIGGER booking_s2_tutor_cancel_commit_guard AFTER UPDATE ON public."Booking"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN (NEW."status"='Cancelled' AND NEW."cancellationActor"='Tutor')
EXECUTE FUNCTION public.booking_tutor_cancel_commit_guard_s2();
REVOKE ALL ON FUNCTION public.booking_guard_s2(), public.slot_guard_s2(), public.notification_guard_s2(), public.reschedule_history_guard_s2(), public.reschedule_history_commit_guard_s2(), public.booking_tutor_cancel_commit_guard_s2() FROM PUBLIC;
-- Only this entry point can write S2 state as the runtime. Call once per
-- transaction, before taking domain locks. HTTP authentication remains upstream.
CREATE FUNCTION public.s2_mutate(op text, principal uuid, sid uuid, target uuid,
  destination uuid DEFAULT NULL, reason text DEFAULT NULL) RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp
AS $mutation$
DECLARE
  b record;
  src record;
  dst record;
  actor_role text;
  actor_active boolean;
  session_revoked_at timestamptz;
  session_expires_at timestamptz;
  decision timestamptz;
  old_slot uuid;
  expected_tutor uuid;
  dest_tutor uuid;
  customer uuid;
  cutoff interval;
BEGIN
  IF op IS NULL OR op NOT IN ('CustomerCancel','TutorCancel','Reschedule','Withdraw','MarkRead')
     OR (op = 'Reschedule') <> (destination IS NOT NULL)
     OR (op = 'TutorCancel') <> (reason IS NOT NULL) THEN
    RAISE EXCEPTION 'Invalid mutation arguments' USING ERRCODE='22023';
  END IF;
  IF reason IS NOT NULL THEN
    reason := regexp_replace(reason, '^[[:space:]]+|[[:space:]]+$', '', 'g');
    IF reason = '' THEN RAISE EXCEPTION 'Blank reason' USING ERRCODE='22023'; END IF;
  END IF;

  -- Build the lock set only from an owner-scoped target. Foreign and missing
  -- targets take only the caller's User and Session locks; no destination lock.
  IF op = 'Withdraw' THEN
    SELECT s."id", s."tutorId" INTO old_slot, expected_tutor
      FROM public."Slot" s WHERE s."id"=target AND s."tutorId"=principal;
  ELSIF op <> 'MarkRead' THEN
    SELECT booking."currentSlotId", booking."customerId", s."tutorId"
      INTO old_slot, customer, expected_tutor
      FROM public."Booking" booking JOIN public."Slot" s ON s."id"=booking."currentSlotId"
      WHERE booking."id"=target
        AND (CASE WHEN op='TutorCancel' THEN s."tutorId" ELSE booking."customerId" END)=principal;
  END IF;
  IF old_slot IS NOT NULL AND op = 'Reschedule' THEN
    SELECT "tutorId" INTO dest_tutor FROM public."Slot" WHERE "id"=destination;
  END IF;

  PERFORM u."id" FROM public."User" u
    WHERE u."id" IN (principal, customer, expected_tutor, dest_tutor)
    ORDER BY u."id" FOR UPDATE;
  SELECT "role", "isActive" INTO actor_role, actor_active FROM public."User" WHERE "id"=principal;
  IF NOT FOUND OR NOT actor_active THEN
    RAISE EXCEPTION 'Invalid actor' USING ERRCODE='28000';
  END IF;
  IF actor_role <> (CASE WHEN op IN ('TutorCancel','Withdraw') THEN 'Tutor' ELSE 'Customer' END) THEN
    RAISE EXCEPTION 'Wrong role' USING ERRCODE='42501';
  END IF;
  IF old_slot IS NOT NULL THEN
    PERFORM s."id" FROM public."Slot" s WHERE s."id" IN (old_slot,destination)
      ORDER BY s."id" FOR UPDATE;
  END IF;
  SELECT "revokedAt", "expiresAt" INTO session_revoked_at, session_expires_at
    FROM public."Session" WHERE "id"=sid AND "userId"=principal FOR UPDATE;
  IF NOT FOUND OR session_revoked_at IS NOT NULL OR session_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'Invalid session' USING ERRCODE='28000';
  END IF;

  IF op = 'MarkRead' THEN
    SELECT "readAt" INTO decision FROM public."Notification"
      WHERE "id"=target AND "recipientCustomerId"=principal FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Not found' USING ERRCODE='P0002'; END IF;
    IF session_expires_at <= clock_timestamp() THEN RAISE EXCEPTION 'Invalid session' USING ERRCODE='28000'; END IF;
    IF decision IS NOT NULL THEN RETURN decision; END IF;
    UPDATE public."Notification" SET "readAt"=clock_timestamp()
      WHERE "id"=target AND "recipientCustomerId"=principal RETURNING "readAt" INTO decision;
    IF NOT FOUND THEN RAISE EXCEPTION 'Not found' USING ERRCODE='P0002'; END IF;
    RETURN decision;
  END IF;

  IF old_slot IS NULL THEN RAISE EXCEPTION 'Not found' USING ERRCODE='P0002'; END IF;
  IF op <> 'Withdraw' THEN
    SELECT "currentSlotId", "customerId", "status", "startsAt", "endsAt" INTO b
      FROM public."Booking" WHERE "id"=target FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Not found' USING ERRCODE='P0002'; END IF;
    IF b."currentSlotId" IS DISTINCT FROM old_slot OR b."customerId" IS DISTINCT FROM customer THEN
      RAISE EXCEPTION 'Lock set changed' USING ERRCODE='40001';
    END IF;
  END IF;
  SELECT "tutorId", "lifecycle", "startsAt" INTO src FROM public."Slot" WHERE "id"=old_slot;
  IF NOT FOUND THEN RAISE EXCEPTION 'Not found' USING ERRCODE='P0002'; END IF;
  IF op IN ('Withdraw','TutorCancel') THEN
    IF src."tutorId" <> principal THEN RAISE EXCEPTION 'Not found' USING ERRCODE='P0002'; END IF;
  ELSIF b."customerId" <> principal THEN
    RAISE EXCEPTION 'Not found' USING ERRCODE='P0002';
  END IF;
  IF op <> 'Withdraw' THEN
    IF b."status" <> 'Booked' THEN
      RAISE EXCEPTION 'Booking is terminal' USING ERRCODE='23514', CONSTRAINT='booking_s2_cancelled_terminal';
    END IF;
  END IF;
  IF op = 'Withdraw' AND src."lifecycle" = 'Withdrawn' THEN
    RAISE EXCEPTION 'Slot is already Withdrawn' USING ERRCODE='P0B04', CONSTRAINT='slot_reactivation_forbidden';
  END IF;
  IF src."lifecycle" <> 'Offered' THEN
    RAISE EXCEPTION 'Slot is not Offered' USING ERRCODE='P0B01';
  END IF;

  -- Lock version rows before T_elig. Compare/update in BEFORE guards makes a
  -- stale REPEATABLE READ/SERIALIZABLE snapshot abort rather than miss occupancy.
  PERFORM g.slot_id FROM public.s2_slot_guard g WHERE g.slot_id IN (old_slot,destination)
    ORDER BY g.slot_id FOR UPDATE;
  decision := clock_timestamp();
  IF session_expires_at <= decision THEN RAISE EXCEPTION 'Invalid session' USING ERRCODE='28000'; END IF;
  IF op = 'Withdraw' THEN
    IF src."startsAt" <= decision THEN RAISE EXCEPTION 'Slot has started' USING ERRCODE='P0B05'; END IF;
    UPDATE public."Slot" SET "lifecycle"='Withdrawn',"withdrawnAt"=decision WHERE "id"=old_slot;
    RETURN decision;
  END IF;
  cutoff := CASE WHEN op='CustomerCancel' THEN interval '30 minutes' ELSE interval '60 minutes' END;
  IF b."startsAt" - decision < cutoff THEN
    RAISE EXCEPTION 'Mutation notice window closed' USING ERRCODE='P0B05';
  END IF;

  IF op = 'Reschedule' THEN
    SELECT "tutorId", "lifecycle", "startsAt", "endsAt" INTO dst FROM public."Slot" WHERE "id"=destination;
    IF NOT FOUND THEN RAISE EXCEPTION 'Destination not found' USING ERRCODE='P0002'; END IF;
    IF dst."tutorId" IS DISTINCT FROM dest_tutor THEN
      RAISE EXCEPTION 'Lock set changed' USING ERRCODE='40001';
    END IF;
    IF destination = old_slot THEN
      RAISE EXCEPTION 'Destination equals current Slot' USING ERRCODE='23514', CONSTRAINT='reschedule_history_distinct_slots';
    END IF;
    IF dst."lifecycle" <> 'Offered'
       OR NOT EXISTS (SELECT FROM public."User" u WHERE u."id"=dst."tutorId" AND u."role"='Tutor' AND u."isActive") THEN
      RAISE EXCEPTION 'Destination unavailable' USING ERRCODE='P0B01';
    END IF;
    IF dst."startsAt" - decision < cutoff THEN
      RAISE EXCEPTION 'Mutation notice window closed' USING ERRCODE='P0B05';
    END IF;
    INSERT INTO public."RescheduleHistory" ("bookingId","oldSlotId","oldTutorId","oldStartsAt","oldEndsAt",
      "newSlotId","newTutorId","newStartsAt","newEndsAt","changedAt")
      VALUES (target,old_slot,src."tutorId",b."startsAt",b."endsAt",destination,dst."tutorId",dst."startsAt",dst."endsAt",decision);
    UPDATE public."Booking" SET "currentSlotId"=destination,"startsAt"=dst."startsAt",
      "endsAt"=dst."endsAt","updatedAt"=decision WHERE "id"=target;
  ELSE
    UPDATE public."Booking" SET "status"='Cancelled',"cancellationActor"=actor_role,
      "tutorCancellationReason"=reason,"cancelledAt"=decision,"updatedAt"=decision WHERE "id"=target;
    IF op = 'TutorCancel' THEN
      UPDATE public."Slot" SET "lifecycle"='Withdrawn',"withdrawnAt"=decision WHERE "id"=old_slot;
      INSERT INTO public."Notification" ("bookingId","recipientCustomerId","kind","createdAt")
        VALUES (target,b."customerId",'TutorCancelled',decision);
    END IF;
  END IF;
  RETURN decision;
END;
$mutation$;
REVOKE ALL ON FUNCTION public.s2_mutate(text,uuid,uuid,uuid,uuid,text) FROM PUBLIC;

DO $grants$
DECLARE runtime_role text;
BEGIN
  FOREACH runtime_role IN ARRAY ARRAY['nuttiew_runtime','nuttiew_ci_runtime'] LOOP
    IF EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname=runtime_role) THEN
      EXECUTE format('GRANT SELECT ON public."RescheduleHistory", public."Notification" TO %I',runtime_role);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.s2_mutate(text,uuid,uuid,uuid,uuid,text) TO %I',runtime_role);
    END IF;
  END LOOP;
END;
$grants$;
COMMIT;
